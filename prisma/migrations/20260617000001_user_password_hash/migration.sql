-- AddColumn: User.passwordHash (nullable)
-- null = OAuth 전용 계정. Credentials 가입 시에만 bcrypt hash 저장.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;
