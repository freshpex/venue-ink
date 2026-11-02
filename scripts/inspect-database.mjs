import pg from 'pg';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:15000});
try {
  const result=await pool.query("SELECT table_schema,table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema,table_name");
  console.log(JSON.stringify({databaseConfigured:!!process.env.DATABASE_URL,neon:process.env.DATABASE_URL?.includes('neon.tech'),secretConfigured:!!process.env.JWT_SECRET,secretLength:process.env.JWT_SECRET?.length,environmentKeys:Object.keys(process.env).filter(k=>/^(DATABASE|JWT|VITE_|CLIENT_|STRIPE|SMTP|RESEND|S3_|NEON_)/.test(k)),tables:result.rows}));
} catch(error){console.error(error.code||error.name);process.exitCode=1;}finally{await pool.end();}
