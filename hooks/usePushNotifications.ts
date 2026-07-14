import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  getPushPreference,
  registerForPushNotifications,
} from '@/lib/push-notifications';

/**
 * Registers the device for push notifications once a user is logged in and
 * the local preference allows it. Mount once near the root of the app.
 */
export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      const enabled = await getPushPreference();
      if (!enabled || cancelled) return;
      await registerForPushNotifications(user.id);
    })();

    return () => { cancelled = true; };
  }, [user?.id]);
}
