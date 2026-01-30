export default async function handler(req: any, res: any) {
  // This endpoint is deprecated in favor of /api/video/start using BytePlus Seedance
  return res.status(404).json({ error: 'Endpoint deprecated. Use /api/video/start' });
}