/*
  Warnings:

  - You are about to drop the `service_request` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE `announcement` DROP FOREIGN KEY `announcement_authorId_fkey`;

-- DropForeignKey
ALTER TABLE `announcement` DROP FOREIGN KEY `announcement_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `diet_plan` DROP FOREIGN KEY `diet_plan_clientId_fkey`;

-- DropForeignKey
ALTER TABLE `diet_plan` DROP FOREIGN KEY `diet_plan_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `diet_plan` DROP FOREIGN KEY `diet_plan_trainerId_fkey`;

-- DropForeignKey
ALTER TABLE `feedback` DROP FOREIGN KEY `feedback_memberId_fkey`;

-- DropForeignKey
ALTER TABLE `feedback` DROP FOREIGN KEY `feedback_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `leave_request` DROP FOREIGN KEY `leave_request_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `leave_request` DROP FOREIGN KEY `leave_request_userId_fkey`;

-- DropForeignKey
ALTER TABLE `memberprogress` DROP FOREIGN KEY `memberprogress_memberId_fkey`;

-- DropForeignKey
ALTER TABLE `reward` DROP FOREIGN KEY `reward_memberId_fkey`;

-- DropForeignKey
ALTER TABLE `reward` DROP FOREIGN KEY `reward_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `service_request` DROP FOREIGN KEY `service_request_memberId_fkey`;

-- DropForeignKey
ALTER TABLE `service_request` DROP FOREIGN KEY `service_request_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `task` DROP FOREIGN KEY `task_assignedToId_fkey`;

-- DropForeignKey
ALTER TABLE `task` DROP FOREIGN KEY `task_creatorId_fkey`;

-- DropForeignKey
ALTER TABLE `tenantsettings` DROP FOREIGN KEY `tenantsettings_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `trainer_availability` DROP FOREIGN KEY `trainer_availability_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `trainer_availability` DROP FOREIGN KEY `trainer_availability_trainerId_fkey`;

-- DropForeignKey
ALTER TABLE `transaction` DROP FOREIGN KEY `transaction_walletId_fkey`;

-- DropForeignKey
ALTER TABLE `wallet` DROP FOREIGN KEY `wallet_memberId_fkey`;

-- DropForeignKey
ALTER TABLE `workout_plan` DROP FOREIGN KEY `workout_plan_clientId_fkey`;

-- DropForeignKey
ALTER TABLE `workout_plan` DROP FOREIGN KEY `workout_plan_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `workout_plan` DROP FOREIGN KEY `workout_plan_trainerId_fkey`;

-- AlterTable
ALTER TABLE `invoice` ADD COLUMN `discount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `notes` TEXT NULL,
    ADD COLUMN `subtotal` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `taxAmount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `taxRate` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    MODIFY `memberId` INTEGER NULL;

-- DropTable
DROP TABLE `service_request`;

-- CreateTable
CREATE TABLE `invoice_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `invoiceId` INTEGER NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `rate` DECIMAL(10, 2) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,

    INDEX `invoiceitem_invoiceId_fkey`(`invoiceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupon` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NULL,
    `code` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'Percentage',
    `value` DECIMAL(10, 2) NOT NULL,
    `minPurchase` DECIMAL(10, 2) NULL DEFAULT 0.00,
    `maxUses` INTEGER NULL DEFAULT 0,
    `usedCount` INTEGER NOT NULL DEFAULT 0,
    `startDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endDate` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `coupon_code_key`(`code`),
    INDEX `coupon_tenantId_fkey`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_category` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `image` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `storecategory_tenantId_fkey`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_product` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NULL,
    `categoryId` INTEGER NULL,
    `name` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NULL,
    `category` VARCHAR(191) NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `originalPrice` DECIMAL(10, 2) NULL,
    `costPrice` DECIMAL(10, 2) NULL,
    `taxRate` DECIMAL(5, 2) NULL DEFAULT 0.00,
    `stock` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `description` TEXT NULL,
    `image` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `store_product_sku_key`(`sku`),
    INDEX `storeproduct_tenantId_fkey`(`tenantId`),
    INDEX `storeproduct_categoryId_fkey`(`categoryId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NULL,
    `memberId` INTEGER NULL,
    `total` DECIMAL(10, 2) NOT NULL,
    `itemsCount` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Processing',
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `guestName` VARCHAR(191) NULL,
    `guestPhone` VARCHAR(191) NULL,
    `guestEmail` VARCHAR(191) NULL,

    INDEX `storeorder_tenantId_fkey`(`tenantId`),
    INDEX `storeorder_memberId_fkey`(`memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_order_item` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderId` INTEGER NOT NULL,
    `productId` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `priceAtBuy` DECIMAL(10, 2) NOT NULL,

    INDEX `storeorderitem_orderId_fkey`(`orderId`),
    INDEX `storeorderitem_productId_fkey`(`productId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `invoice` ADD CONSTRAINT `invoice_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice_item` ADD CONSTRAINT `invoice_item_invoiceId_fkey` FOREIGN KEY (`invoiceId`) REFERENCES `invoice`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupon` ADD CONSTRAINT `coupon_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_category` ADD CONSTRAINT `store_category_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_product` ADD CONSTRAINT `store_product_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `store_category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_product` ADD CONSTRAINT `store_product_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_order` ADD CONSTRAINT `store_order_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_order` ADD CONSTRAINT `store_order_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_order_item` ADD CONSTRAINT `store_order_item_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `store_order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_order_item` ADD CONSTRAINT `store_order_item_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `store_product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- RedefineIndex
CREATE INDEX `Announcement_authorId_fkey` ON `announcement`(`authorId`);
DROP INDEX `announcement_authorId_fkey` ON `announcement`;

-- RedefineIndex
CREATE INDEX `MemberProgress_memberId_fkey` ON `memberprogress`(`memberId`);
DROP INDEX `memberprogress_memberId_fkey` ON `memberprogress`;

-- RedefineIndex
CREATE INDEX `Task_assignedToId_fkey` ON `task`(`assignedToId`);
DROP INDEX `task_assignedToId_fkey` ON `task`;

-- RedefineIndex
CREATE INDEX `Task_creatorId_fkey` ON `task`(`creatorId`);
DROP INDEX `task_creatorId_fkey` ON `task`;

-- RedefineIndex
CREATE INDEX `Transaction_walletId_fkey` ON `transaction`(`walletId`);
DROP INDEX `transaction_walletId_fkey` ON `transaction`;
