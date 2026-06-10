/**
 * TipTap v3 adapter around `prosemirror-search` (Marijn Haverbeke, MIT).
 *
 * Replaces the unmaintained `@sereneinserenade/tiptap-search-and-replace`
 * (no v3 npm release). Exposes the exact command surface the editor's
 * search bar already calls — `setSearchTerm`, `setReplaceTerm`,
 * `nextSearchResult`, `previousSearchResult`, `replace`, `replaceAll` —
 * backed by `prosemirror-search`'s plugin + commands, so the UI wiring
 * stays unchanged. Match highlighting comes from the plugin's own
 * decorations (`.ProseMirror-search-match` / `-active-search-match`,
 * styled in `global.css`).
 */

import { Extension } from "@tiptap/core";
import {
  SearchQuery,
  findNext,
  findPrev,
  replaceAll,
  replaceNext,
  search,
  setSearchState,
} from "prosemirror-search";

export interface SearchAndReplaceOptions {
  /** When true, the search term is matched literally (regex disabled). */
  disableRegex: boolean;
}

export interface SearchAndReplaceStorage {
  searchTerm: string;
  replaceTerm: string;
}

declare module "@tiptap/core" {
  interface Storage {
    searchAndReplace: SearchAndReplaceStorage;
  }
  interface Commands<ReturnType> {
    searchAndReplace: {
      setSearchTerm: (term: string) => ReturnType;
      setReplaceTerm: (term: string) => ReturnType;
      nextSearchResult: () => ReturnType;
      previousSearchResult: () => ReturnType;
      replace: () => ReturnType;
      replaceAll: () => ReturnType;
    };
  }
}

export const SearchAndReplace = Extension.create<
  SearchAndReplaceOptions,
  SearchAndReplaceStorage
>({
  name: "searchAndReplace",

  addOptions() {
    return { disableRegex: true };
  },

  addStorage() {
    return { searchTerm: "", replaceTerm: "" };
  },

  addProseMirrorPlugins() {
    return [search()];
  },

  addCommands() {
    const regexp = !this.options.disableRegex;
    const buildQuery = (storage: SearchAndReplaceStorage): SearchQuery =>
      new SearchQuery({
        search: storage.searchTerm,
        replace: storage.replaceTerm,
        regexp,
      });

    return {
      setSearchTerm:
        (term: string) =>
        ({ editor, tr, dispatch }) => {
          editor.storage.searchAndReplace.searchTerm = term;
          if (dispatch) {
            setSearchState(tr, buildQuery(editor.storage.searchAndReplace));
          }
          return true;
        },
      setReplaceTerm:
        (term: string) =>
        ({ editor, tr, dispatch }) => {
          editor.storage.searchAndReplace.replaceTerm = term;
          if (dispatch) {
            setSearchState(tr, buildQuery(editor.storage.searchAndReplace));
          }
          return true;
        },
      nextSearchResult:
        () =>
        ({ state, dispatch }) =>
          findNext(state, dispatch),
      previousSearchResult:
        () =>
        ({ state, dispatch }) =>
          findPrev(state, dispatch),
      replace:
        () =>
        ({ state, dispatch }) =>
          replaceNext(state, dispatch),
      replaceAll:
        () =>
        ({ state, dispatch }) =>
          replaceAll(state, dispatch),
    };
  },
});

export default SearchAndReplace;
