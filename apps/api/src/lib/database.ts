import { Pool,type PoolClient,type QueryResultRow } from 'pg';
const connectionString=process.env.DATABASE_URL;if(!connectionString)throw new Error('DATABASE_URL is required');
function databaseSsl(){if(process.env.DATABASE_SSL==='disable')return false;if(process.env.NODE_ENV!=='production'&&process.env.DATABASE_SSL!=='require')return undefined;return{rejectUnauthorized:process.env.DATABASE_SSL_REJECT_UNAUTHORIZED!=='false'}}
export const pool=new Pool({connectionString,max:Number(process.env.DATABASE_POOL_MAX??10),ssl:databaseSsl()});
export async function query<T extends QueryResultRow>(text:string,values:unknown[]=[]):Promise<T[]>{return (await pool.query<T>(text,values)).rows}
export async function transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T>{const client=await pool.connect();try{await client.query('begin');const result=await work(client);await client.query('commit');return result}catch(error){await client.query('rollback');throw error}finally{client.release()}}
