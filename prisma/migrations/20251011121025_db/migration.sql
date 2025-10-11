-- CreateTable
CREATE TABLE "characters" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "weapon1" TEXT,
    "weapon2" TEXT,
    "combat_power" INTEGER,
    "gear_image_url" TEXT,
    "active" TEXT NOT NULL DEFAULT 'ACTIVE',
    "dkp" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "characters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "events" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_time" DATETIME NOT NULL,
    "end_time" DATETIME NOT NULL,
    "dkp_reward" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "attendances" (
    "event_id" INTEGER NOT NULL,
    "character_id" INTEGER NOT NULL,

    PRIMARY KEY ("event_id", "character_id"),
    CONSTRAINT "attendances_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "attendances_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "items" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "image_url" TEXT,
    "min_dkp_cost" INTEGER NOT NULL DEFAULT 1
);

-- CreateTable
CREATE TABLE "wishes" (
    "character_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,

    PRIMARY KEY ("character_id", "item_id"),
    CONSTRAINT "wishes_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "characters" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "wishes_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "characters_name_key" ON "characters"("name");

-- CreateIndex
CREATE UNIQUE INDEX "items_name_key" ON "items"("name");
