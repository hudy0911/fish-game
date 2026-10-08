import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { CircleCheckIcon, CoffeeIcon, GaugeIcon, NetworkIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { LOCALE_LABELS, LOCALES, type AppLocale } from '@/i18n/locales';
import { useLocale } from '@/i18n/LocaleProvider';
import { DonationDialog } from './DonationDialog';
import { TransportProfilesDialog } from './TransportProfilesDialog';
import { clearAllBrowserStorage } from '../lib/clearLocalData';
import {
  getCachedFishUser,
  logoutFishUser,
  refreshFishUser,
  subscribeFishUser,
  type FishUser,
} from '../lib/fishUser';
import {
  getSelectedTransportProfile,
  getTransportProfiles,
  selectTransportProfile,
  type TransportConfig,
} from '../lib/transportConfig';

const sectionCardClass =
  'gap-4 rounded-[18px] border-border bg-[linear-gradient(150deg,var(--surface-2),var(--surface))] flex-shrink-0';

function transportMessageSuffix(config: TransportConfig): 'peerjs' | 'lan' | 'supabase' {
  if (config.adapter === 'peerjs') return 'peerjs';
  if (config.adapter === 'lan') return 'lan';
  return 'supabase';
}

type UserSettingsPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function UserSettingsPanel({ open, onOpenChange }: UserSettingsPanelProps) {
  const intl = useIntl();
  const { locale, setLocale } = useLocale();
  const [profilesVersion, setProfilesVersion] = useState(0);
  const [profilesOpen, setProfilesOpen] = useState(false);
  const [donationOpen, setDonationOpen] = useState(false);
  const [clearDataOpen, setClearDataOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [fishUser, setFishUser] = useState<FishUser | null>(() => getCachedFishUser());
  const [fishBusy, setFishBusy] = useState(false);
  const profiles = getTransportProfiles();
  const selectedProfile = getSelectedTransportProfile();
  const transportSuffix = transportMessageSuffix(selectedProfile.config);

  useEffect(() => {
    if (open) {
      void refreshFishUser();
    }
  }, [open]);

  useEffect(() => subscribeFishUser(setFishUser), []);

  async function handleClearData(): Promise<void> {
    setClearing(true);
    try {
      await clearAllBrowserStorage();
      window.location.reload();
    } catch {
      setClearing(false);
    }
  }

  async function handleFishLogout(): Promise<void> {
    setFishBusy(true);
    try {
      await logoutFishUser();
    } finally {
      setFishBusy(false);
    }
  }

  async function handleFishLogin(): Promise<void> {
    setFishBusy(true);
    try {
      const { startFishOAuth } = await import('../lib/fishUser');
      await startFishOAuth('#/');
    } catch (reason) {
      setFishBusy(false);
      const message = reason instanceof Error ? reason.message : String(reason);
      toast.error(intl.formatMessage({ id: 'auth.startFailed' }, { error: message }));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-md"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>{intl.formatMessage({ id: 'user.settings.sheetTitle' })}</SheetTitle>
          <SheetDescription>{intl.formatMessage({ id: 'user.settings.sheetDescription' })}</SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6">
          <Card className={sectionCardClass}>
            <CardHeader>
              <span className="text-[9px] font-extrabold tracking-[0.14em] text-primary-bright uppercase">
                {intl.formatMessage({ id: 'user.settings.fishEyebrow' })}
              </span>
              <CardTitle className="mt-1 text-lg">
                {intl.formatMessage({ id: 'user.settings.fishTitle' })}
              </CardTitle>
              <CardDescription>
                {intl.formatMessage({ id: 'user.settings.fishDescription' })}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {fishUser ? (
                <>
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-background/55 p-3">
                    {fishUser.avatar ? (
                      <img
                        src={fishUser.avatar}
                        alt=""
                        className="size-10 rounded-full border border-border object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="grid size-10 place-items-center rounded-full bg-primary/20 text-sm font-semibold text-primary-bright">
                        {fishUser.name.slice(0, 1)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{fishUser.name}</p>
                      <p className="truncate text-xs text-muted-foreground">@{fishUser.username}</p>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {intl.formatMessage({ id: 'user.settings.fishLinkedHint' })}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleFishLogout()}
                    disabled={fishBusy}
                  >
                    {intl.formatMessage({ id: 'user.settings.fishUnlink' })}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {intl.formatMessage({ id: 'user.settings.fishUnlinkedHint' })}
                  </p>
                  <Button type="button" onClick={handleFishLogin}>
                    {intl.formatMessage({ id: 'user.settings.fishLogin' })}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>

          <Card className={sectionCardClass}>
            <CardHeader>
              <span className="text-[9px] font-extrabold tracking-[0.14em] text-primary-bright uppercase">
                {intl.formatMessage({ id: 'user.settings.transportEyebrow' })}
              </span>
              <CardTitle className="mt-1 text-lg">{intl.formatMessage({ id: 'user.settings.transportTitle' })}</CardTitle>
              <CardDescription>{intl.formatMessage({ id: 'user.settings.transportDescription' })}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Label htmlFor="parti-user-transport">{intl.formatMessage({ id: 'user.settings.transportLabel' })}</Label>
              <Select value={selectedProfile.id} onValueChange={(value) => {
                selectTransportProfile(value);
                setProfilesVersion((current) => current + 1);
              }}>
                <SelectTrigger id="parti-user-transport" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => {
                    const suffix = transportMessageSuffix(profile.config);
                    const friendlyLabel = intl.formatMessage({ id: `user.settings.transport.${suffix}.optionLabel` });
                    return (
                      <SelectItem key={profile.id} value={profile.id}>
                        {profile.custom
                          ? intl.formatMessage(
                            { id: 'user.settings.transport.customOption' },
                            { label: friendlyLabel, name: profile.name },
                          )
                          : friendlyLabel}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              <div className="min-w-0 rounded-xl border border-border bg-background/55 p-3.5" aria-live="polite">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="font-semibold text-foreground">
                    {intl.formatMessage({ id: `user.settings.transport.${transportSuffix}.title` })}
                  </span>
                  {transportSuffix === 'peerjs' && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-primary-bright uppercase">
                      {intl.formatMessage({ id: 'user.settings.transport.recommended' })}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {intl.formatMessage({ id: `user.settings.transport.${transportSuffix}.technology` })}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {intl.formatMessage({ id: `user.settings.transport.${transportSuffix}.summary` })}
                </p>
                <ul className="mt-3 grid gap-2 text-xs leading-relaxed text-muted-foreground">
                  <li className="flex gap-2">
                    <NetworkIcon className="mt-0.5 size-3.5 shrink-0 text-primary-bright" aria-hidden="true" />
                    <span>{intl.formatMessage({ id: `user.settings.transport.${transportSuffix}.network` })}</span>
                  </li>
                  <li className="flex gap-2">
                    <GaugeIcon className="mt-0.5 size-3.5 shrink-0 text-primary-bright" aria-hidden="true" />
                    <span>{intl.formatMessage({ id: `user.settings.transport.${transportSuffix}.latency` })}</span>
                  </li>
                  <li className="flex gap-2">
                    <CircleCheckIcon className="mt-0.5 size-3.5 shrink-0 text-primary-bright" aria-hidden="true" />
                    <span>{intl.formatMessage({ id: `user.settings.transport.${transportSuffix}.reliability` })}</span>
                  </li>
                </ul>
              </div>
              <p className="text-xs text-muted-foreground">{intl.formatMessage({ id: 'user.settings.transportHint' })}</p>
              <Button type="button" variant="outline" onClick={() => setProfilesOpen(true)}>
                {intl.formatMessage({ id: 'user.settings.profilesButton' })}
              </Button>
              <p className="text-xs text-muted-foreground">{intl.formatMessage({ id: 'user.settings.profilesHint' })}</p>
            </CardContent>
          </Card>

          <Card className={sectionCardClass}>
            <CardHeader>
              <span className="text-[9px] font-extrabold tracking-[0.14em] text-primary-bright uppercase">
                {intl.formatMessage({ id: 'user.settings.languageEyebrow' })}
              </span>
              <CardTitle className="mt-1 text-lg">{intl.formatMessage({ id: 'user.settings.languageTitle' })}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Label htmlFor="parti-user-locale">{intl.formatMessage({ id: 'user.settings.languageLabel' })}</Label>
              <Select value={locale} onValueChange={(value) => setLocale(value as AppLocale)}>
                <SelectTrigger id="parti-user-locale" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCALES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {LOCALE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{intl.formatMessage({ id: 'user.settings.languageHint' })}</p>
            </CardContent>
          </Card>

          <Card className={sectionCardClass}>
            <CardHeader>
              <span className="text-[9px] font-extrabold tracking-[0.14em] text-primary-bright uppercase">
                {intl.formatMessage({ id: 'user.settings.donationEyebrow' })}
              </span>
              <CardTitle className="mt-1 text-lg">{intl.formatMessage({ id: 'user.settings.donationTitle' })}</CardTitle>
              <CardDescription>{intl.formatMessage({ id: 'user.settings.donationDescription' })}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" variant="outline" className="w-full" onClick={() => setDonationOpen(true)}>
                <CoffeeIcon data-icon="inline-start" />
                {intl.formatMessage({ id: 'user.settings.donationButton' })}
              </Button>
            </CardContent>
          </Card>

          <div className="border-t border-border pt-4">
            <Button type="button" variant="destructive" className="w-full" onClick={() => setClearDataOpen(true)}>
              {intl.formatMessage({ id: 'user.settings.clearData' })}
            </Button>
          </div>
        </div>
      </SheetContent>
      <TransportProfilesDialog
        key={profilesVersion}
        open={profilesOpen}
        onOpenChange={setProfilesOpen}
        onProfilesChange={() => setProfilesVersion((current) => current + 1)}
      />
      <DonationDialog open={donationOpen} onOpenChange={setDonationOpen} />
      <Dialog open={clearDataOpen} onOpenChange={setClearDataOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{intl.formatMessage({ id: 'user.settings.clearDataTitle' })}</DialogTitle>
            <DialogDescription>{intl.formatMessage({ id: 'user.settings.clearDataDescription' })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearDataOpen(false)} disabled={clearing}>
              {intl.formatMessage({ id: 'user.settings.clearDataCancel' })}
            </Button>
            <Button variant="destructive" onClick={() => void handleClearData()} disabled={clearing}>
              {intl.formatMessage({ id: 'user.settings.clearDataConfirm' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
