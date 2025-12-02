const {PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const cols=await p.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='User'`;
  console.log(cols);
  await p.$disconnect();
})();
