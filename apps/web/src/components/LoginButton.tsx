import { useEffect, useState, type ReactElement } from 'react';
import { useIntl } from 'react-intl';
import { LogInIcon, LogOutIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  getCachedFishUser,
  logoutFishUser,
  refreshFishUser,
  startFishOAuth,
  subscribeFishUser,
  type FishUser,
} from '../lib/fishUser';

export function LoginButton(): ReactElement | null {
  const intl = useIntl();
  const [user, setUser] = useState<FishUser | null>(() => getCachedFishUser());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void refreshFishUser();
    return subscribeFishUser(setUser);
  }, []);

  async function handleLogin(): Promise<void> {
    if (busy) return;
    setBusy(true);
    try {
      const next = window.location.hash || '#/';
      await startFishOAuth(next);
    } catch (error) {
      setBusy(false);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(intl.formatMessage({ id: 'auth.startFailed' }, { error: message }));
    }
  }

  async function handleLogout(): Promise<void> {
    setBusy(true);
    try {
      await logoutFishUser();
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <Button
        size="sm"
        className="gap-1.5"
        disabled={busy}
        onClick={() => void handleLogin()}
        data-testid="parti-login"
      >
        <LogInIcon />
        <span className="hidden sm:inline">{intl.formatMessage({ id: 'auth.login' })}</span>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="gap-1.5 px-2 text-muted-foreground hover:text-foreground"
      aria-label={intl.formatMessage({ id: 'auth.logoutAria' }, { name: user.name })}
      title={intl.formatMessage({ id: 'auth.logoutTitle' })}
      onClick={() => void handleLogout()}
      disabled={busy}
      data-testid="parti-logout"
    >
      {user.avatar ? (
        <img
          src={user.avatar}
          alt=""
          className="size-6 rounded-full border border-border object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="grid size-6 place-items-center rounded-full bg-primary/20 text-[11px] font-semibold text-primary-bright">
          {user.name.slice(0, 1)}
        </span>
      )}
      <span className="hidden max-w-[120px] truncate sm:inline">{user.name}</span>
      <LogOutIcon className="hidden sm:inline" />
    </Button>
  );
}