from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.hookspecs import BibliogonHookSpec
from app.routers import assets, backup, books, chapters, licenses, settings

from pluginforge import PluginManager
from pluginforge.fastapi import mount_plugin_routes, register_plugin_endpoints

BASE_DIR = Path(__file__).resolve().parent.parent

manager = PluginManager(
    app_config_path="config/app.yaml",
    base_dir=BASE_DIR,
)
manager.load_hookspecs(BibliogonHookSpec)

# Configure routes with the manager
licenses.configure(manager)
settings.configure(BASE_DIR, manager)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    manager.discover_and_load()
    mount_plugin_routes(app, manager)
    yield


app = FastAPI(
    title="Bibliogon",
    description="Open-source book authoring platform.",
    version="0.5.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(books.router, prefix="/api")
app.include_router(chapters.router, prefix="/api")
app.include_router(assets.router, prefix="/api")
app.include_router(backup.router, prefix="/api")
app.include_router(licenses.router, prefix="/api")
app.include_router(settings.router, prefix="/api")

register_plugin_endpoints(app, manager)


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.5.0"}
