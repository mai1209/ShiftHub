export function hasProPlanAccess(user: any) {
  const plan = String(user?.subscription?.plan || "").trim();
  const status = String(user?.subscription?.status || "").trim();
  return (plan === 'pro' || plan === 'custom') && status === 'active';
}
