/*
  Warnings:

  - Added the required column `updatedAt` to the `task` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `task` DROP FOREIGN KEY `task_assignedToId_fkey`;

-- AlterTable
ALTER TABLE `payroll` ADD COLUMN `attendanceDays` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `baseSalary` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `commission` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `leaveDays` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `leaveDeduction` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `rejectionReason` TEXT NULL;

-- AlterTable
ALTER TABLE `task` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `delegationNote` TEXT NULL,
    ADD COLUMN `managerId` INTEGER NULL,
    ADD COLUMN `staffDeadline` DATETIME(3) NULL,
    ADD COLUMN `staffId` INTEGER NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL,
    MODIFY `assignedToId` INTEGER NULL,
    MODIFY `priority` VARCHAR(191) NOT NULL DEFAULT 'Medium';

-- AlterTable
ALTER TABLE `tenantsettings` ADD COLUMN `referralReward` INTEGER NOT NULL DEFAULT 500;

-- CreateTable
CREATE TABLE `commission` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL,
    `trainerId` INTEGER NOT NULL,
    `memberId` INTEGER NULL,
    `invoiceId` INTEGER NULL,
    `ptAccountId` INTEGER NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `month` INTEGER NOT NULL,
    `year` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Pending',
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `commission_trainerId_idx`(`trainerId`),
    INDEX `commission_tenantId_idx`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `payroll_staffId_fkey` ON `payroll`(`staffId`);

-- CreateIndex
CREATE INDEX `task_managerId_idx` ON `task`(`managerId`);

-- CreateIndex
CREATE INDEX `task_staffId_idx` ON `task`(`staffId`);

-- AddForeignKey
ALTER TABLE `payroll` ADD CONSTRAINT `payroll_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task` ADD CONSTRAINT `task_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task` ADD CONSTRAINT `task_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task` ADD CONSTRAINT `task_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission` ADD CONSTRAINT `commission_trainerId_fkey` FOREIGN KEY (`trainerId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission` ADD CONSTRAINT `commission_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `commission` ADD CONSTRAINT `commission_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
