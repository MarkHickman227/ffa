import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const email = process.argv[2] || 'markhickman@avaloncreativeltd.com'
const hash = await bcrypt.hash('Password123!', 12)

const u = await prisma.user.update({
  where: { email },
  data: { passwordHash: hash },
  select: { email: true, firstName: true, lastName: true, role: true },
})

console.log(`✓ Password reset to Password123! for ${u.firstName} ${u.lastName} (${u.email}) [${u.role}]`)
await prisma.$disconnect()
