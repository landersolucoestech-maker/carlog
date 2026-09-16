import type { FastifyRequest } from 'fastify';
import type { PermissionKey, UserIdentity } from '@carlog/auth';
import { requirePermission } from '@carlog/auth';
import { authenticate } from './authenticate.js';
export async function authorize(request:FastifyRequest,permission:PermissionKey):Promise<UserIdentity>{const user=await authenticate(request);try{requirePermission(user,permission)}catch(error){throw Object.assign(error instanceof Error?error:new Error('Forbidden'),{statusCode:403})}return user}
