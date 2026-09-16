import type { FastifyInstance } from 'fastify';
import { registerLeadsRoutes } from './leads.js';
import { registerCustomersRoutes } from './customers.js';
import { registerQuotesRoutes } from './quotes.js';
import { registerOrdersRoutes } from './orders.js';
import { registerCarriersRoutes } from './carriers.js';
import { registerDispatchRoutes } from './dispatch.js';
import { registerDispatchBoardRoutes } from './dispatch-board.js';
import { registerFinanceRoutes } from './finance.js';

export async function registerBrokerageRoutes(app: FastifyInstance): Promise<void> {
  await registerLeadsRoutes(app);
  await registerCustomersRoutes(app);
  await registerQuotesRoutes(app);
  await registerOrdersRoutes(app);
  await registerCarriersRoutes(app);
  await registerDispatchBoardRoutes(app);
  await registerDispatchRoutes(app);
  await registerFinanceRoutes(app);
}
