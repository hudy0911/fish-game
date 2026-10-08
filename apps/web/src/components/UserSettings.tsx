/**
 * 头部「设置」按钮：仅作为打开 UserSettingsPanel 的入口。
 * 用户身份完全由 FishUser 提供，不再展示本地用户名。
 */
import { lazy, Suspense, useState } from 'react';
import { useIntl } from 'react-intl';
import { SettingsIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

const UserSettingsPanel = lazy(() =>
  import('./UserSettingsPanel').then((module) => ({ default: module.UserSettingsPanel })),
);

export function UserSettings() {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  function openSettings(): void {
    setLoaded(true);
    setOpen(true);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={intl.formatMessage({ id: 'user.settings.ariaLabel' })}
        onClick={openSettings}
      >
        <SettingsIcon />
      </Button>
      {loaded && (
        <Suspense fallback={null}>
          <UserSettingsPanel open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  );
}