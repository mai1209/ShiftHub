function getAdminSecret() {
  return String(
    process.env.SUBSCRIPTIONS_ADMIN_SECRET ??
      process.env.ADMIN_PANEL_SECRET ??
      process.env.CRON_SECRET ??
      '',
  ).trim();
}

export function requireAdminPanelSecret(req, res, next) {
  try {
    const expectedSecret = getAdminSecret();
    if (!expectedSecret) {
      return res.status(500).json({
        error: 'Falta configurar SUBSCRIPTIONS_ADMIN_SECRET en el backend.',
      });
    }

    const bearerHeader = String(req.headers.authorization ?? '').trim();
    const bearerSecret = bearerHeader.startsWith('Bearer ')
      ? bearerHeader.slice(7).trim()
      : '';
    const headerSecret = String(req.headers['x-admin-secret'] ?? '').trim();
    const querySecret = String(req.query?.secret ?? '').trim();
    const bodySecret =
      req.body && typeof req.body === 'object'
        ? String(req.body.secret ?? '').trim()
        : '';

    const providedSecret =
      bearerSecret || headerSecret || querySecret || bodySecret;

    if (!providedSecret || providedSecret !== expectedSecret) {
      return res.status(401).json({ error: 'Secret de administración inválido.' });
    }

    return next();
  } catch (err) {
    return next(err);
  }
}
