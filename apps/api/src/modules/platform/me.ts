import type { FastifyInstance } from 'fastify';
import { authenticate } from '../../auth/authenticate.js';

export async function registerMeRoute(app: FastifyInstance): Promise<void> {
  app.get('/v1/me', async (request) => {
    const user = await authenticate(request);
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      active: user.active,
      roles: user.roleKeys,
      permissions: user.permissions,
    };
  });
}
