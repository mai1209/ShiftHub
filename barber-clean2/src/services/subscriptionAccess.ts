export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | null | undefined;
export type AppRole = 'admin' | 'barber';

export function isSubscriptionRestricted(status: SubscriptionStatus) {
  return status === 'trial' || status === 'past_due' || status === 'cancelled';
}

export function resolveUserRole(user: any): AppRole {
  return String(user?.role ?? '').trim().toLowerCase() === 'barber'
    ? 'barber'
    : 'admin';
}

export function resolvePostAuthRoute(user: any) {
  if (resolveUserRole(user) === 'barber') {
    return 'Barber-Home';
  }

  return isSubscriptionRestricted(user?.subscription?.status)
    ? 'Subscription-Settings'
    : 'Home';
}
