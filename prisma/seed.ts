import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient, UserRole, UserStatus } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const superEmail = process.env.SUPERADMIN_EMAIL;
  const superPass = process.env.SUPERADMIN_PASSWORD;

  if (!superEmail || !superPass) {
    console.error("Set SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD in .env before seeding.");
    process.exit(1);
  }

  console.log("seeding with password raw", JSON.stringify(superPass));
  const passwordHash = await bcrypt.hash(superPass, 10);
  const verify = await bcrypt.compare(superPass, passwordHash);
  console.log("hashing password for superadmin", superEmail, passwordHash, "verify", verify);

  const superadmin = await prisma.user.upsert({
    where: { email: superEmail },
    update: {
      passwordHash,
      status: UserStatus.ACTIVE,
      role: UserRole.SUPERADMIN,
    },
    create: {
      email: superEmail,
      name: "Superadmin",
      role: UserRole.SUPERADMIN,
      status: UserStatus.ACTIVE,
      passwordHash,
    },
  });

  console.log("Seeded superadmin:", superadmin.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
