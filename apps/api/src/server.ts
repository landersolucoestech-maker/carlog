import Fastify from 'fastify';
import { ZodError } from 'zod';
import { registerBrokerageRoutes } from './modules/brokerage/index.js';
import { registerPublicLeadRoutes } from './modules/leads/public-routes.js';
import { registerWebsiteChatRoutes } from './modules/communication/website-chat.js';
import { registerCommunicationRoutes } from './modules/communication/routes.js';
import { registerIntegrationRoutes } from './modules/integrations/routes.js';
import { registerDialpadWebhookRoutes } from './modules/integrations/dialpad-webhook.js';
import { registerAutomationRoutes } from './modules/automation/routes.js';
import { registerAiRoutes } from './modules/ai/routes.js';
import { registerUsersRoutes } from './modules/platform/users.js';
import { registerSettingsRoutes } from './modules/platform/settings.js';
import { registerDashboardRoutes } from './modules/dashboard/routes.js';
import { registerCmsRoutes } from './modules/cms/routes.js';
import { registerDocumentRoutes } from './modules/documents/routes.js';
import { pool } from './lib/database.js';
import { requestCorrelationId } from './lib/request-context.js';

const app=Fastify({logger:{level:process.env.LOG_LEVEL??'info'},bodyLimit:2_000_000,trustProxy:true});
const allowedOrigins=new Set([process.env.PUBLIC_WEB_URL,process.env.ADMIN_URL].filter((value):value is string=>Boolean(value)));

app.addContentTypeParser('application/jwt',{parseAs:'string'},(_request,body,done)=>done(null,body));
app.addHook('onRequest',async(request,reply)=>{const correlationId=requestCorrelationId(request);reply.header('x-correlation-id',correlationId);const origin=request.headers.origin;if(origin&&allowedOrigins.has(origin)){reply.header('access-control-allow-origin',origin);reply.header('vary','Origin');reply.header('access-control-allow-credentials','true');reply.header('access-control-allow-headers','Authorization,Content-Type,Idempotency-Key,X-Correlation-Id,X-Chat-Token');reply.header('access-control-allow-methods','GET,POST,PUT,PATCH,DELETE,OPTIONS')}if(request.method==='OPTIONS'){if(origin&&!allowedOrigins.has(origin))return reply.code(403).send({error:'Origin not allowed'});return reply.code(204).send()}});
app.setErrorHandler((error,request,reply)=>{const status=error instanceof ZodError?400:typeof (error as {statusCode?:unknown}).statusCode==='number'?(error as {statusCode:number}).statusCode:500;const correlationId=String(reply.getHeader('x-correlation-id')??requestCorrelationId(request));if(status>=500)request.log.error({err:error,correlationId},'Request failed');return reply.code(status).send({error:status>=500?'Internal server error':error.message,correlationId,...(error instanceof ZodError?{issues:error.issues}: {})})});

app.get('/health',async()=>{await pool.query('select 1');return{status:'ok',service:'carlog-api',company:'Car Log Connection',timestamp:new Date().toISOString()}});

await registerPublicLeadRoutes(app);
await registerWebsiteChatRoutes(app);
await registerDialpadWebhookRoutes(app);
await registerBrokerageRoutes(app);
await registerCommunicationRoutes(app);
await registerIntegrationRoutes(app);
await registerAutomationRoutes(app);
await registerAiRoutes(app);
await registerUsersRoutes(app);
await registerSettingsRoutes(app);
await registerDashboardRoutes(app);
await registerCmsRoutes(app);
await registerDocumentRoutes(app);

const port=Number(process.env.PORT??4000);const host=process.env.HOST??'0.0.0.0';
const shutdown=async(signal:string)=>{app.log.info({signal},'Shutting down');await app.close();await pool.end();process.exit(0)};
process.on('SIGTERM',()=>void shutdown('SIGTERM'));process.on('SIGINT',()=>void shutdown('SIGINT'));
await app.listen({port,host});
