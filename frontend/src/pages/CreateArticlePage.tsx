import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import * as Select from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";
import { api, ApiError, ContentType } from "../api/client";
import { getStorage } from "../storage";
import { PageLayout } from "../components/PageLayout";
import {
  useContentTypes,
  contentTypeDefaultTitleKey,
  contentTypeLabelKey,
} from "../hooks/useContentTypes";
import { useGoBack } from "../hooks/navigation/useGoBack";
import { useI18n } from "../hooks/useI18n";
import { notify } from "../utils/platform/notify";
import AuthorSelectInput from "../components/shared/AuthorSelectInput";

/**
 * Full-page article-creation surface (Dialog->Pages migration C2).
 *
 * Article creation used to be a one-click, form-less action on the
 * ArticleList split-button (create with a default title + author, jump
 * straight to the editor). This page makes it a deep-linkable route at
 * `/articles/new?type=<content_type>` while preserving that ergonomics:
 * the title field is pre-filled with the per-type default title and the
 * author with the configured profile name, so a user can still create in
 * one keystroke (Enter/click) OR adjust the fields first.
 */
export default function CreateArticlePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const goBack = useGoBack("/articles");
  const typesSnapshot = useContentTypes();
  const [searchParams] = useSearchParams();

  // Resolve ?type= against the registry. A valid ?type= is an EXPLICIT
  // type choice (the dashboard dropdown deep-links with it); the bare
  // main "Neuer Text" button navigates without one, so the type defaults
  // to the registry default (blogpost) but stays "not explicitly chosen".
  const requested = searchParams.get("type");
  const requestedValid = !!(requested && typesSnapshot.types[requested]);

  const [selectedType, setSelectedType] = useState<ContentType>(
    (requestedValid ? requested : typesSnapshot.defaultId) as ContentType,
  );
  // Until the user signals a specific type (deep-link ?type= or picking
  // one in the dropdown) the page shows the GENERIC title ("Neuer Text"),
  // not a per-type one ("Neuer Blogpost") -- the user hasn't chosen a type.
  const [explicit, setExplicit] = useState(requestedValid);
  const [titleDirty, setTitleDirty] = useState(false);

  const genericTitle = t("ui.articles.default_title", "Neuer Text");
  const typeTitle = (typeId: string): string => {
    const key = contentTypeDefaultTitleKey(typesSnapshot, typeId);
    return key ? t(key, genericTitle) : genericTitle;
  };
  // Title shown in the page heading + pre-filled into the input.
  const contextTitle = explicit ? typeTitle(selectedType) : genericTitle;

  const [title, setTitle] = useState(contextTitle);
  const [author, setAuthor] = useState("");
  const [authorChoices, setAuthorChoices] = useState<string[]>([]);
  const [language, setLanguage] = useState("de");
  const [submitting, setSubmitting] = useState(false);

  // CONFIGURABLE-DEFAULT-CONTENT-BOOK-TYPE-01: the workspace default
  // content-type (ui.defaults.content_type) is fetched async below and
  // applied once both it and the type registry are available. An
  // explicit ?type= (requestedValid) or a manual dropdown pick
  // (userChoseTypeRef) always wins over the configured default.
  const [configuredContentType, setConfiguredContentType] = useState<
    string | null
  >(null);
  const userChoseTypeRef = useRef(false);

  // Keep the title field in sync with the type context (initial load +
  // type-dropdown changes) until the user edits it by hand.
  useEffect(() => {
    if (!titleDirty) setTitle(contextTitle);
  }, [contextTitle, titleDirty]);

  const handleTypeChange = (value: string) => {
    userChoseTypeRef.current = true;
    setSelectedType(value as ContentType);
    setExplicit(true);
  };

  // Apply a valid ?type= deep-link once the content-type registry has
  // loaded. The registry is fetched async, so on the first render it may
  // be empty -> requestedValid is false -> selectedType initialises to the
  // default. When the registry resolves the deep-linked type must still be
  // applied (and treated as an explicit choice). Idempotent; the user's
  // manual dropdown pick always wins.
  useEffect(() => {
    if (userChoseTypeRef.current) return;
    if (!requested || !typesSnapshot.types[requested]) return;
    setSelectedType(requested as ContentType);
    setExplicit(true);
  }, [requested, typesSnapshot]);

  // Apply the configured default content-type once it has loaded AND
  // the registry knows it. Skipped when the user deep-linked an
  // explicit ?type= or already picked a type by hand. Setting the type
  // here is NOT an explicit choice, so the generic title is preserved.
  useEffect(() => {
    if (requestedValid || userChoseTypeRef.current) return;
    if (!configuredContentType) return;
    if (!typesSnapshot.types[configuredContentType]) return;
    setSelectedType(configuredContentType as ContentType);
  }, [configuredContentType, typesSnapshot, requestedValid]);

  // Pre-fill the author from the configured profile (mirrors the former
  // one-click create). Silent fail: a blank author is fine, the user can
  // fill it in the editor sidebar.
  useEffect(() => {
    let cancelled = false;
    getStorage()
      .settings.getApp()
      .then((config) => {
        const authorConfig = (config.author || {}) as Record<string, unknown>;
        const realName = (authorConfig.name as string) || "";
        const penNames = Array.isArray(authorConfig.pen_names)
          ? (authorConfig.pen_names as string[]).filter(Boolean)
          : [];
        const uiConfig = (config.ui || {}) as Record<string, unknown>;
        const uiDefaults = (uiConfig.defaults || {}) as Record<string, unknown>;
        const defaultContentType = uiDefaults.content_type;
        if (cancelled) return;
        setAuthorChoices(realName ? [realName, ...penNames] : penNames);
        if (realName) setAuthor((prev) => prev || realName);
        if (typeof defaultContentType === "string") {
          setConfiguredContentType(defaultContentType);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const canSubmit = !!title.trim() && !submitting;

  const handleSubmit = async () => {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const fresh = await getStorage().articles.create({
        title: title.trim(),
        language,
        author: author.trim() || null,
        content_type: selectedType,
      });
      navigate(`/articles/${fresh.id}`);
    } catch (err) {
      notify.error(
        t("ui.articles.create_error", "Konnte Artikel nicht erstellen."),
        err instanceof ApiError ? err : undefined,
      );
      setSubmitting(false);
    }
  };

  return (
    <PageLayout
      title={contextTitle}
      titleTestId={`create-article-title-${selectedType}`}
      testId="create-article-page"
      maxWidth="md"
      onBack={goBack}
      backLabel={t("ui.common.back", "Zurück")}
    >
      <div className="field">
        {/* Generic field labels reused from the create-book namespace —
            identical strings ("Titel"/"Autor"/"Sprache"), so a shared key
            avoids i18n duplication/drift across the two create surfaces. */}
        <label className="label">
          {t("ui.create_book.book_title", "Titel")} *
        </label>
        <input
          className="input"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleDirty(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          data-testid="create-article-title"
          autoFocus
        />
      </div>

      {/* Content-type selector — all registered types, the registry
          default (blogpost) pre-selected. Picking a type makes the
          choice explicit and (until the user edits the title) updates
          the title to that type's default. */}
      <div className="field">
        <label className="label">
          {t("ui.articles.content_type", "Textart")}
        </label>
        <Select.Root value={selectedType} onValueChange={handleTypeChange}>
          <Select.Trigger
            className="radix-select-trigger"
            data-testid="create-article-type"
          >
            <Select.Value />
            <Select.Icon>
              <ChevronDown size={14} />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              className="radix-select-content"
              position="popper"
              sideOffset={4}
            >
              <Select.Viewport>
                {typesSnapshot.ordered.map((typeDef) => (
                  <Select.Item
                    key={typeDef.id}
                    value={typeDef.id}
                    className="radix-select-item"
                    data-testid={`create-article-type-${typeDef.id}`}
                  >
                    <Select.ItemText>
                      {t(contentTypeLabelKey(typesSnapshot, typeDef.id), typeDef.id)}
                    </Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>

      <div className="field">
        <label className="label">{t("ui.create_book.author", "Autor")}</label>
        <AuthorSelectInput
          value={author}
          onChange={setAuthor}
          suggestions={authorChoices}
          profileChoices={authorChoices}
          customOptionLabel={t(
            "ui.author_select.custom_option",
            "Anderer Name …",
          )}
          showAddToAuthorsCheckbox={false}
          addToAuthorsDb={false}
          onAddToAuthorsDbChange={() => {}}
          addToAuthorsLabel=""
          testidPrefix="create-article"
          inputTestId="create-article-author"
          placeholder={t(
            "ui.create_book.author_placeholder",
            "Autorenname oder Pen Name",
          )}
        />
      </div>

      <div className="field">
        <label className="label">
          {t("ui.create_book.language", "Sprache")}
        </label>
        <Select.Root value={language} onValueChange={setLanguage}>
          <Select.Trigger className="radix-select-trigger">
            <Select.Value />
            <Select.Icon>
              <ChevronDown size={14} />
            </Select.Icon>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              className="radix-select-content"
              position="popper"
              sideOffset={4}
            >
              <Select.Viewport>
                {[
                  { value: "de", label: t("ui.languages.de", "Deutsch") },
                  { value: "en", label: t("ui.languages.en", "English") },
                  { value: "es", label: t("ui.languages.es", "Espanol") },
                  { value: "fr", label: t("ui.languages.fr", "Francais") },
                  { value: "el", label: t("ui.languages.el", "Ellinika") },
                ].map((opt) => (
                  <Select.Item
                    key={opt.value}
                    value={opt.value}
                    className="radix-select-item"
                  >
                    <Select.ItemText>{opt.label}</Select.ItemText>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>
      </div>

      <div className="mt-6 flex justify-end gap-2 border-t border-border pt-4">
        <button className="btn btn-ghost" onClick={goBack}>
          {t("ui.common.cancel", "Abbrechen")}
        </button>
        <button
          className="btn btn-primary"
          onClick={() => void handleSubmit()}
          disabled={!canSubmit}
          data-testid="create-article-submit"
        >
          {t("ui.common.create", "Erstellen")}
        </button>
      </div>
    </PageLayout>
  );
}
