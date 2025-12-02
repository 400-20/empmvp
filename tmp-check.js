const bcrypt=require("bcryptjs");
const {PrismaClient}=require("@prisma/client");
const p=new PrismaClient();
(async()=>{
  const admin=await p.user.findUnique({where:{email:"admin@admin.com"}});
  console.log("admin hash", admin?.passwordHash);
  console.log("compare admin123", await bcrypt.compare("admin123", admin?.passwordHash||""));
  console.log("compare pass1234", await bcrypt.compare("pass1234", admin?.passwordHash||""));
  const org=admin?.orgId ? await p.organization.findUnique({where:{id:admin.orgId}}):null;
  console.log("org status", org?.status);
  await p.$disconnect();
})();
