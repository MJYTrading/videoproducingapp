import { Router, Request, Response } from 'express';
import prisma from '../db.js';
import { hashPassword, verifyPassword, createSession } from '../auth.js';

const router = Router();

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Gebruikersnaam en wachtwoord zijn verplicht' });
    if (password.length < 6) return res.status(400).json({ error: 'Wachtwoord moet minimaal 6 tekens zijn' });
    const existingUser = await prisma.user.findFirst();
    if (existingUser) return res.status(403).json({ error: 'Er bestaat al een account. Gebruik login.' });
    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({ data: { username, passwordHash } });
    const token = await createSession(user.id);
    res.json({ token, username: user.username });
  } catch (error: any) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Registratie mislukt' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Gebruikersnaam en wachtwoord zijn verplicht' });
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return res.status(401).json({ error: 'Ongeldige login' });
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Ongeldige login' });
    const token = await createSession(user.id);
    res.json({ token, username: user.username });
  } catch (error: any) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login mislukt' });
  }
});

router.get('/check', async (_req: Request, res: Response) => {
  try {
    const userCount = await prisma.user.count();
    res.json({ hasAccount: userCount > 0 });
  } catch (error: any) {
    res.status(500).json({ error: 'Check mislukt' });
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      await prisma.session.deleteMany({ where: { token } });
    }
    res.json({ ok: true });
  } catch (error: any) {
    res.status(500).json({ error: 'Logout mislukt' });
  }
});

export default router;
