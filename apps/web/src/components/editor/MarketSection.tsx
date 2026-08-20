/** 房间市场面板：展示 GitHub issue 注册表中上架的在线房间模版，支持一键安装与滚动分页加载。 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { DownloadIcon, Loader2Icon, RefreshCwIcon, Share2Icon, StoreIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatResolveError } from '@/i18n/formatErrors';
import { copyTextToClipboard } from '@/lib/clipboard';
import {
  buildMarketShareUrl,
  cacheMarketState,
  getMarketTemplate,
  installMarketTemplate,
  listInstalledMarketRefs,
  listMarketTemplates,
  loadMarketPage,
  MARKET_DOCS_URL,
  mergeMarketEntries,
  marketReleaseUrl,
  type MarketError,
  type MarketTemplateEntry,
} from '@/lib/market';

interface MarketSectionProps {
  /** 分享路由携带的卡片 id；null 表示路由存在但 id 无效，undefined 表示普通访问。 */
  featuredIssueNumber?: number | null;
  onInstalled: (templateId: string) => void;
  /** 市场卡片选择状态变化时上报，用于阻止把未安装卡片当作可创建模板。 */
  onSelectionChange?: (selected: boolean) => void;
  /** 已加载的市场条目数变化时上报（用于分类 tab 计数）。 */
  onEntriesChange?: (count: number) => void;
}

interface MarketViewState {
  entries: MarketTemplateEntry[];
  nextPage: number;
  hasMore: boolean;
  stale: boolean;
  error?: MarketError;
}

function badgeClass(badge: string): string {
  return badge === 'recommend'
    ? 'bg-success/15 text-success'
    : 'bg-primary-bright/15 text-primary-bright';
}

type FeaturedStatus = 'idle' | 'loading' | 'ready' | 'not-found' | 'error';

export function MarketSection({ featuredIssueNumber, onInstalled, onSelectionChange, onEntriesChange }: MarketSectionProps) {
  const intl = useIntl();
  const [state, setState] = useState<MarketViewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [installedRefs, setInstalledRefs] = useState<Set<string>>(new Set());
  const [installingRef, setInstallingRef] = useState<string | null>(null);
  const [installErrors, setInstallErrors] = useState<Record<string, string>>({});
  const [featuredEntry, setFeaturedEntry] = useState<MarketTemplateEntry | null>(null);
  const [featuredStatus, setFeaturedStatus] = useState<FeaturedStatus>('idle');
  const [selectedIssueNumber, setSelectedIssueNumber] = useState<number | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const loadingMoreRef = useRef(loadingMore);
  loadingMoreRef.current = loadingMore;
  const featuredEntryRef = useRef(featuredEntry);
  featuredEntryRef.current = featuredEntry;

  useEffect(() => {
    let active = true;
    setFeaturedEntry(null);
    if (featuredIssueNumber === undefined) {
      setFeaturedStatus('idle');
      return () => { active = false; };
    }
    if (featuredIssueNumber === null) {
      setFeaturedStatus('not-found');
      return () => { active = false; };
    }
    setFeaturedStatus('loading');
    void getMarketTemplate(featuredIssueNumber).then((entry) => {
      if (!active) return;
      if (!entry) {
        setFeaturedStatus('not-found');
        return;
      }
      setFeaturedEntry(entry);
      setSelectedIssueNumber(entry.issueNumber);
      setFeaturedStatus('ready');
    }).catch(() => {
      if (active) setFeaturedStatus('error');
    });
    return () => { active = false; };
  }, [featuredIssueNumber]);

  const load = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setLoadMoreError(null);
    try {
      const result = await listMarketTemplates({ forceRefresh });
      setState({
        entries: result.entries,
        nextPage: result.nextPage,
        hasMore: result.hasMore,
        stale: result.stale,
        ...(result.error ? { error: result.error } : {}),
      });
      setInstalledRefs(await listInstalledMarketRefs());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async () => {
    const current = stateRef.current;
    if (!current || !current.hasMore || loadingMoreRef.current) return;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const displayed = mergeMarketEntries([
        ...(featuredEntryRef.current ? [featuredEntryRef.current] : []),
        ...current.entries,
      ]);
      const excludeRefs = new Set(displayed.map((entry) => entry.ref));
      const excludeIssueNumbers = new Set(displayed.map((entry) => entry.issueNumber));
      const page = await loadMarketPage(current.nextPage, excludeRefs, excludeIssueNumbers);
      const merged = mergeMarketEntries([...current.entries, ...page.entries]);
      setState({ ...current, entries: merged, nextPage: page.nextPage, hasMore: page.hasMore, stale: false });
      cacheMarketState(merged, page.nextPage, page.hasMore);
    } catch (reason) {
      setLoadMoreError(formatResolveError(intl, reason));
    } finally {
      setLoadingMore(false);
    }
  }, [intl]);

  const loadMoreRef = useRef(loadMore);
  loadMoreRef.current = loadMore;

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (observed) => {
        if (observed.some((entry) => entry.isIntersecting)) void loadMoreRef.current();
      },
      { rootMargin: '240px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  async function install(entry: MarketTemplateEntry): Promise<void> {
    setInstallingRef(entry.ref);
    setInstallErrors((previous) => {
      const next = { ...previous };
      delete next[entry.ref];
      return next;
    });
    try {
      const id = await installMarketTemplate(entry);
      setInstalledRefs(await listInstalledMarketRefs());
      onInstalled(id);
    } catch (reason) {
      setInstallErrors((previous) => ({ ...previous, [entry.ref]: formatResolveError(intl, reason) }));
    } finally {
      setInstallingRef(null);
    }
  }

  async function share(entry: MarketTemplateEntry): Promise<void> {
    const url = buildMarketShareUrl(window.location.href, entry.issueNumber);
    const copyPromise = copyTextToClipboard(url);
    const sharePromise = typeof navigator.share === 'function'
      ? navigator.share({
          title: entry.manifest?.name ?? entry.ref,
          text: entry.manifest?.description,
          url,
        }).catch(() => undefined)
      : Promise.resolve();
    const copied = await copyPromise;
    await sharePromise;
    if (copied) toast.success(intl.formatMessage({ id: 'editor.market.shareCopied' }));
    else toast.error(intl.formatMessage({ id: 'editor.market.shareCopyFailed' }));
  }

  const entries = mergeMarketEntries([
    ...(featuredEntry ? [featuredEntry] : []),
    ...(state?.entries ?? []),
  ]);
  const registryFailed = Boolean(state?.error) && !state?.stale;

  const entryCount = entries.length;
  const onEntriesChangeRef = useRef(onEntriesChange);
  onEntriesChangeRef.current = onEntriesChange;
  useEffect(() => {
    onEntriesChangeRef.current?.(entryCount);
  }, [entryCount]);

  const onSelectionChangeRef = useRef(onSelectionChange);
  onSelectionChangeRef.current = onSelectionChange;
  useEffect(() => {
    onSelectionChangeRef.current?.(selectedIssueNumber !== null);
  }, [selectedIssueNumber]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted-foreground">
          <FormattedMessage id="editor.market.description" />{' '}
          <a
            className="text-primary-bright underline-offset-2 hover:underline"
            href={MARKET_DOCS_URL}
            target="_blank"
            rel="noreferrer"
          >
            <FormattedMessage id="editor.market.publishGuide" />
          </a>
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={loading}
          onClick={() => void load(true)}
        >
          <RefreshCwIcon data-icon="inline-start" className={cn(loading && 'animate-spin')} />
          {loading
            ? intl.formatMessage({ id: 'editor.market.refreshing' })
            : intl.formatMessage({ id: 'editor.market.refresh' })}
        </Button>
      </div>

      {state?.stale && (
        <div className="mb-3 rounded-[11px] border border-primary-bright/30 bg-primary-bright/10 px-3.5 py-3 text-xs text-foreground">
          <FormattedMessage id="editor.market.staleWarning" />
        </div>
      )}
      {registryFailed && (
        <div className="mb-3 rounded-[11px] border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-xs text-destructive">
          {formatResolveError(intl, state?.error)}
        </div>
      )}
      {featuredStatus === 'not-found' && (
        <div className="mb-3 rounded-[11px] border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-xs text-destructive">
          <FormattedMessage id="editor.market.sharedNotFound" />
        </div>
      )}
      {featuredStatus === 'error' && (
        <div className="mb-3 rounded-[11px] border border-primary-bright/30 bg-primary-bright/10 px-3.5 py-3 text-xs text-foreground">
          <FormattedMessage id="editor.market.sharedLoadFailed" />
        </div>
      )}

      {!loading && entries.length === 0 && !registryFailed ? (
        <div className="flex min-h-32 flex-col items-center justify-center rounded-[20px] border border-dashed border-border-strong bg-card/55 p-8 text-center">
          <StoreIcon className="mb-3 size-8 text-primary-bright/70" aria-hidden="true" />
          <b><FormattedMessage id="editor.market.emptyTitle" /></b>
          <p className="mt-1 text-sm text-muted-foreground"><FormattedMessage id="editor.market.emptyDescription" /></p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] md:gap-[18px]">
            {entries.map((entry) => {
              const selected = selectedIssueNumber === entry.issueNumber;
              const installed = installedRefs.has(entry.ref);
              const installing = installingRef === entry.ref;
              const unavailable = Boolean(entry.manifestError);
              const installError = installErrors[entry.ref];
              const releaseOnly = entry.source?.primary.kind === 'release-zip';
              const fallbackUrl = marketReleaseUrl(entry.source, entry);
              return (
                <div
                  key={entry.ref}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected}
                  aria-label={intl.formatMessage(
                    { id: 'editor.market.selectCard' },
                    { name: entry.manifest?.name ?? entry.ref },
                  )}
                  className={cn(
                    'relative flex cursor-pointer flex-col items-stretch overflow-hidden rounded-[18px] border border-border bg-surface shadow-[0_10px_28px_rgba(91,72,15,0.07)] outline-none transition-[transform,box-shadow,border-color] duration-150 hover:-translate-y-[3px] hover:border-border-strong hover:shadow-[0_20px_46px_rgba(91,72,15,0.16)] focus-visible:ring-3 focus-visible:ring-ring/50',
                    selected && 'border-[#d6a900] shadow-[0_0_0_2px_rgba(214,169,0,0.32),0_18px_44px_rgba(214,169,0,0.18)]',
                  )}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest('a,button')) return;
                    setSelectedIssueNumber(entry.issueNumber);
                  }}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    setSelectedIssueNumber(entry.issueNumber);
                  }}
                >
                  {selected && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon-sm"
                      className="absolute top-3 right-3 z-[3] rounded-full bg-surface/90 shadow-sm"
                      aria-label={intl.formatMessage(
                        { id: 'editor.market.shareCard' },
                        { name: entry.manifest?.name ?? entry.ref },
                      )}
                      title={intl.formatMessage({ id: 'editor.market.share' })}
                      onClick={() => void share(entry)}
                    >
                      <Share2Icon aria-hidden="true" />
                    </Button>
                  )}
                  <span
                    className="relative block aspect-[16/10] w-full bg-[linear-gradient(135deg,rgba(155,113,0,0.22),rgba(139,92,246,0.18)_55%,rgba(81,219,147,0.2))] bg-cover bg-center"
                    aria-hidden="true"
                    style={entry.cover ? { backgroundImage: `url(${entry.cover})` } : undefined}
                  >
                    {installing && (
                      <span className="absolute inset-0 z-[1] flex items-center justify-center gap-2 bg-black/45 text-[11px] font-semibold text-white">
                        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
                        <FormattedMessage id="editor.market.installing" />
                      </span>
                    )}
                  </span>
                  {(entry.badges.length > 0 || releaseOnly) && (
                    <span className="absolute top-3 left-3 z-[2] flex gap-1.5">
                      {releaseOnly && (
                        <span className="rounded-full bg-surface/90 px-2.5 py-[3px] text-[10px] font-bold text-foreground shadow-sm">
                          <FormattedMessage id="editor.market.releaseOnly" />
                        </span>
                      )}
                      {entry.badges.map((badge) => (
                        <span
                          key={badge}
                          className={cn('rounded-full px-2.5 py-[3px] text-[10px] font-bold', badgeClass(badge))}
                        >
                          {intl.formatMessage({ id: `editor.market.badges.${badge}` })}
                        </span>
                      ))}
                    </span>
                  )}
                  <span className="flex flex-1 flex-col gap-2 px-[13px] pt-3 pb-3.5 md:px-5 md:pt-[18px] md:pb-5">
                    <b className="text-sm md:text-base">{entry.manifest?.name ?? entry.ref}</b>
                    <small className="text-xs font-medium leading-[1.55] text-muted-foreground">
                      {entry.manifestError
                        ? intl.formatMessage({ id: `editor.market.${entry.manifestError === 'MANIFEST_INVALID' ? 'manifestInvalid' : 'manifestUnavailable'}` })
                        : entry.manifest?.description ?? ''}
                    </small>
                    <span className="mt-auto flex items-center justify-between gap-2 pt-1">
                      <a
                        className="min-w-0 truncate text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                        href={entry.issueUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {entry.ref}
                      </a>
                      {releaseOnly && fallbackUrl ? (
                        <Button asChild variant="outline" size="sm" className="flex-none gap-1.5">
                          <a href={fallbackUrl} target="_blank" rel="noreferrer">
                            <DownloadIcon data-icon="inline-start" />
                            <FormattedMessage id="editor.market.downloadZip" />
                          </a>
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="flex-none gap-1.5"
                          disabled={unavailable || installingRef !== null}
                          onClick={() => void install(entry)}
                        >
                          <DownloadIcon data-icon="inline-start" />
                          {installed
                            ? intl.formatMessage({ id: 'editor.market.reinstall' })
                            : intl.formatMessage({ id: 'editor.market.install' })}
                        </Button>
                      )}
                    </span>
                    {releaseOnly && (
                      <span className="text-[11px] text-muted-foreground">
                        <FormattedMessage id="editor.market.releaseOnlyHint" />
                      </span>
                    )}
                    {installError && (
                      <span className="flex flex-col gap-1.5 rounded-[11px] border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-[11px] text-destructive">
                        {installError}
                        {fallbackUrl && (
                          <a
                            className="inline-flex w-max items-center gap-1 font-semibold text-foreground underline-offset-2 hover:underline"
                            href={fallbackUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <DownloadIcon className="size-3" aria-hidden="true" />
                            <FormattedMessage id="editor.market.downloadFallback" />
                          </a>
                        )}
                        {fallbackUrl && (
                          <span className="text-muted-foreground">
                            <FormattedMessage id="editor.market.downloadFallbackHint" />
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          <div ref={sentinelRef} className="mt-4 flex min-h-6 items-center justify-center gap-2 text-xs text-muted-foreground">
            {loadingMore && (
              <>
                <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" />
                <FormattedMessage id="editor.market.loadingMore" />
              </>
            )}
            {!loadingMore && loadMoreError && (
              <>
                <span className="text-destructive">{loadMoreError}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => void loadMore()}>
                  <FormattedMessage id="editor.market.loadMoreRetry" />
                </Button>
              </>
            )}
            {!loadingMore && !loadMoreError && state && !state.hasMore && entries.length > 0 && (
              <FormattedMessage id="editor.market.allLoaded" />
            )}
          </div>
        </>
      )}
    </div>
  );
}
