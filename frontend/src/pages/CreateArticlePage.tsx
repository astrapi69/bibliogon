import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import * as Select from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";
import { api, ApiError, ContentType } from "../api/client";
import { PageLayout } from "../components/PageLayout";
import {
  useContentTypes,
  contentTypeDefaultTitleKey,
} from "../hooks/useContentTypes";
import { useGoBack } from "../hooks/useGoBack";
import { useI18n } from "../hooks/useI18n";
import { notify } from "../utils/notify";

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

  // Resolve ?type= against the registry; fall back to the default type
  // (the same default the split-button's primary action used).
  const requested = searchParams.get("type");
  const contentType: ContentType = (
    requested && typesSnapshot.types[requested]
      ? requested
      : typesSnapshot.defaultId
  ) as ContentType;

  const genericTitle = t("ui.articles.default_title", "Neuer Artikel");
  const titleKey = contentTypeDefaultTitleKey(typesSnapshot, contentType);
  const defaultTitle = titleKey ? t(titleKey, genericTitle) : genericTitle;

  const [title, setTitle] = useState(defaultTitle);
  const [author, setAuthor] = useState("");
  const [authorChoices, setAuthorChoices] = useState<string[]>([]);
  const [language, setLanguage] = useState("de");
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill the author from the configured profile (mirrors the former
  // one-click create). Silent fail: a blank author is fine, the user can
  // fill it in the editor sidebar.
  useEffect(() => {
    let cancelled = false;
    api.settings
      .getApp()
      .then((config) => {
        const authorConfig = (config.author || {}) as Record<string, unknown>;
        const realName = (authorConfig.name as string) || "";
        const penNames = Array.isArray(authorConfig.pen_names)
          ? (authorConfig.pen_names as string[]).filter(Boolean)
          : [];
        if (cancelled) return;
        setAuthorChoices(realName ? [realName, ...penNames] : penNames);
        if (realName) setAuthor((prev) => prev || realName);
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
      const fresh = await api.articles.create({
        title: title.trim(),
        language,
        author: author.trim() || null,
        content_type: contentType,
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
      title={defaultTitle}
      titleTestId={`create-article-title-${contentType}`}
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
          onChange={(e) => setTitle(e.target.value)}
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

      <div className="field">
        <label className="label">{t("ui.create_book.author", "Autor")}</label>
        <input
          className="input"
          list="create-article-author-choices"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder={t(
            "ui.create_book.author_placeholder",
            "Autorenname oder Pen Name",
          )}
          data-testid="create-article-author"
        />
        <datalist id="create-article-author-choices">
          {authorChoices.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
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
