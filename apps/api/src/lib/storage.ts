import { createClient } from '@supabase/supabase-js';

const url=process.env.SUPABASE_URL;const secret=process.env.SUPABASE_SECRET_KEY;if(!url||!secret)throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY are required');
const client=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

export async function createSignedUpload(bucket:string,path:string):Promise<{path:string;token:string;signedUrl:string}>{const{data,error}=await client.storage.from(bucket).createSignedUploadUrl(path);if(error||!data)throw Object.assign(new Error(error?.message??'Failed to create signed upload URL'),{statusCode:502});return{path:data.path,token:data.token,signedUrl:data.signedUrl}}
export async function createSignedDownload(bucket:string,path:string,expiresIn=300):Promise<string>{const{data,error}=await client.storage.from(bucket).createSignedUrl(path,expiresIn);if(error||!data)throw Object.assign(new Error(error?.message??'Failed to create signed download URL'),{statusCode:502});return data.signedUrl}
