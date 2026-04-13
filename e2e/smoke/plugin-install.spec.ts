/**
 * Smoke tests for plugin ZIP installation via the API.
 *
 * Builds a minimal valid plugin ZIP in-memory and exercises the
 * install -> list -> uninstall -> list lifecycle. Complements the
 * 15 backend integration tests in test_plugin_install.py with an
 * API-level E2E that runs against the real running server.
 */

import {test, expect} from '../fixtures/base'
import * as zlib from 'node:zlib'

const API = 'http://localhost:8000/api'

/**
 * Build a minimal valid plugin ZIP as a Buffer.
 *
 * Uses raw ZIP byte construction (local file headers + central directory)
 * to avoid adding a dependency. The ZIP contains:
 * - bibliogon-plugin-{name}/plugin.yaml
 * - bibliogon-plugin-{name}/{pkg}/__init__.py
 * - bibliogon-plugin-{name}/{pkg}/plugin.py
 */
function buildPluginZip(pluginName: string, version: string = '1.0.0'): Buffer {
  const pkgName = pluginName.replace(/-/g, '_')
  const topDir = `bibliogon-plugin-${pluginName}`

  const yamlContent = [
    'plugin:',
    `  name: "${pluginName}"`,
    `  display_name: "E2E Test Plugin"`,
    `  description: "Plugin created by E2E test"`,
    `  version: "${version}"`,
    `  license: "MIT"`,
  ].join('\n')

  const pluginPy = [
    'from pluginforge import BasePlugin',
    '',
    `class E2EPlugin(BasePlugin):`,
    `    name = "${pluginName}"`,
    `    version = "${version}"`,
  ].join('\n')

  const files: Array<{path: string; content: string}> = [
    {path: `${topDir}/plugin.yaml`, content: yamlContent},
    {path: `${topDir}/${pkgName}/__init__.py`, content: ''},
    {path: `${topDir}/${pkgName}/plugin.py`, content: pluginPy},
  ]

  // Build ZIP manually (store method, no compression)
  const localHeaders: Buffer[] = []
  const centralHeaders: Buffer[] = []
  let offset = 0

  for (const file of files) {
    const nameBytes = Buffer.from(file.path, 'utf-8')
    const dataBytes = Buffer.from(file.content, 'utf-8')
    const crc = crc32(dataBytes)

    // Local file header (30 + name + data)
    const local = Buffer.alloc(30 + nameBytes.length + dataBytes.length)
    local.writeUInt32LE(0x04034b50, 0) // signature
    local.writeUInt16LE(20, 4)         // version needed
    local.writeUInt16LE(0, 6)          // flags
    local.writeUInt16LE(0, 8)          // compression (store)
    local.writeUInt16LE(0, 10)         // mod time
    local.writeUInt16LE(0, 12)         // mod date
    local.writeUInt32LE(crc, 14)       // crc32
    local.writeUInt32LE(dataBytes.length, 18) // compressed size
    local.writeUInt32LE(dataBytes.length, 22) // uncompressed size
    local.writeUInt16LE(nameBytes.length, 26) // name length
    local.writeUInt16LE(0, 28)         // extra length
    nameBytes.copy(local, 30)
    dataBytes.copy(local, 30 + nameBytes.length)
    localHeaders.push(local)

    // Central directory header (46 + name)
    const central = Buffer.alloc(46 + nameBytes.length)
    central.writeUInt32LE(0x02014b50, 0) // signature
    central.writeUInt16LE(20, 4)          // version made by
    central.writeUInt16LE(20, 6)          // version needed
    central.writeUInt16LE(0, 8)           // flags
    central.writeUInt16LE(0, 10)          // compression
    central.writeUInt16LE(0, 12)          // mod time
    central.writeUInt16LE(0, 14)          // mod date
    central.writeUInt32LE(crc, 16)        // crc32
    central.writeUInt32LE(dataBytes.length, 20) // compressed
    central.writeUInt32LE(dataBytes.length, 24) // uncompressed
    central.writeUInt16LE(nameBytes.length, 28) // name length
    central.writeUInt16LE(0, 30)          // extra length
    central.writeUInt16LE(0, 32)          // comment length
    central.writeUInt16LE(0, 34)          // disk start
    central.writeUInt16LE(0, 36)          // internal attrs
    central.writeUInt32LE(0, 38)          // external attrs
    central.writeUInt32LE(offset, 42)     // local header offset
    nameBytes.copy(central, 46)
    centralHeaders.push(central)

    offset += local.length
  }

  const centralDirOffset = offset
  const centralDirSize = centralHeaders.reduce((s, b) => s + b.length, 0)

  // End of central directory (22 bytes)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // signature
  eocd.writeUInt16LE(0, 4)          // disk number
  eocd.writeUInt16LE(0, 6)          // central dir disk
  eocd.writeUInt16LE(files.length, 8)  // entries on disk
  eocd.writeUInt16LE(files.length, 10) // total entries
  eocd.writeUInt32LE(centralDirSize, 12) // central dir size
  eocd.writeUInt32LE(centralDirOffset, 16) // central dir offset
  eocd.writeUInt16LE(0, 20)         // comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd])
}

/** Simple CRC-32 (IEEE) computation. */
function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i]
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0)
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0
}

test.describe('Plugin ZIP installation lifecycle', () => {
  const pluginName = 'e2e-test-plugin'

  test.afterEach(async ({request}) => {
    // Cleanup: try to uninstall the test plugin
    await request.delete(`${API}/plugins/install/${pluginName}`).catch(() => {})
  })

  test('install a valid plugin ZIP via API', async ({request}) => {
    const zipBuffer = buildPluginZip(pluginName)

    const resp = await request.post(`${API}/plugins/install`, {
      multipart: {
        file: {
          name: `${pluginName}.zip`,
          mimeType: 'application/zip',
          buffer: zipBuffer,
        },
      },
    })
    expect(resp.status()).toBe(200)
    const body = await resp.json()
    expect(body.plugin).toBe(pluginName)
    expect(body.version).toBe('1.0.0')
  })

  test('installed plugin appears in the list', async ({request}) => {
    const zipBuffer = buildPluginZip(pluginName, '2.0.0')
    await request.post(`${API}/plugins/install`, {
      multipart: {
        file: {
          name: `${pluginName}.zip`,
          mimeType: 'application/zip',
          buffer: zipBuffer,
        },
      },
    })

    const resp = await request.get(`${API}/plugins/installed`)
    expect(resp.status()).toBe(200)
    const plugins = await resp.json()
    const installed = plugins.find((p: {name: string}) => p.name === pluginName)
    expect(installed).toBeTruthy()
    expect(installed.version).toBe('2.0.0')
  })

  test('uninstall removes the plugin', async ({request}) => {
    const zipBuffer = buildPluginZip(pluginName)
    await request.post(`${API}/plugins/install`, {
      multipart: {
        file: {
          name: `${pluginName}.zip`,
          mimeType: 'application/zip',
          buffer: zipBuffer,
        },
      },
    })

    const delResp = await request.delete(`${API}/plugins/install/${pluginName}`)
    expect(delResp.status()).toBe(200)
    const body = await delResp.json()
    expect(body.status).toBe('uninstalled')

    // Verify gone from list
    const listResp = await request.get(`${API}/plugins/installed`)
    const plugins = await listResp.json()
    const found = plugins.find((p: {name: string}) => p.name === pluginName)
    expect(found).toBeFalsy()
  })

  test('installing invalid ZIP returns 400', async ({request}) => {
    const resp = await request.post(`${API}/plugins/install`, {
      multipart: {
        file: {
          name: 'bad-plugin.zip',
          mimeType: 'application/zip',
          buffer: Buffer.from('not a zip', 'utf-8'),
        },
      },
    })
    expect(resp.status()).toBe(400)
  })

  test('uninstalling nonexistent plugin returns 404', async ({request}) => {
    const resp = await request.delete(`${API}/plugins/install/does-not-exist-plugin`)
    expect(resp.status()).toBe(404)
  })
})
