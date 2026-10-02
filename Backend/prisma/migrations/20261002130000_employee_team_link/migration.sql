-- Link a payroll Employee to their Ohnix login (team member / owner).
ALTER TABLE "employees" ADD COLUMN "user_id" TEXT;
CREATE UNIQUE INDEX "employees_user_id_key" ON "employees"("user_id");
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
