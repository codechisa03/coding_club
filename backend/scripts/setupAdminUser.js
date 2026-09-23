require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { createClient } = require("@supabase/supabase-js");
const bcrypt = require("bcryptjs");
const env = require("../src/config/env");

/**
 * CLI Utility Script to create or configure a Supabase Admin user.
 * 
 * Usage:
 *   node scripts/setupAdminUser.js [password] [email]
 */

const PASSWORD = process.argv[2] || "Admin@CodingClub2026!";
const EMAIL = process.argv[3] || "admin.vnu9923r@codingclub.com";

async function main() {
  console.log("🚀 Initializing Supabase Admin Client...");

  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Missing Supabase credentials in backend/.env");
    process.exit(1);
  }

  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  console.log(`\n⚙️ Configuring Supabase Admin for Email: ${EMAIL}`);

  let userRecord;
  try {
    // 1. Create or Find User via Supabase Auth Admin API
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) throw listError;
    
    let existingUser = (users || []).find(u => u.email === EMAIL);
    
    if (existingUser) {
      console.log(`✅ Found existing Supabase Auth User (${existingUser.email})`);
      const { data: updated, error: updateError } = await supabase.auth.admin.updateUserById(
        existingUser.id,
        { password: PASSWORD, email_confirm: true }
      );
      if (updateError) throw updateError;
      userRecord = updated.user;
      console.log(`🔑 Password updated for ID: ${userRecord.id}`);
    } else {
      console.log(`🚀 User Email not found in Supabase Auth. Creating new user...`);
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: EMAIL,
        password: PASSWORD,
        email_confirm: true
      });
      if (createError) throw createError;
      userRecord = created.user;
      console.log(`✅ Created new Supabase Auth User ID: ${userRecord.id}`);
    }
    
    // 2. Set Custom Claims: we don't necessarily need JWT claims if our own DB table validates admin!
    // But we map it to our internal admins table matching what we had before.
    
    // 3. Upsert record into our Database 'admins' collection
    const passwordHash = bcrypt.hashSync(PASSWORD, 10);
    const adminDoc = {
      id: userRecord.id,
      email: EMAIL.toLowerCase(),
      name: "Supabase Administrator",
      role: "admin",
      password_hash: passwordHash,
      updated_at: new Date().toISOString()
    };

    const { error: dbError } = await supabase
      .from("admins")
      .upsert([adminDoc]);
      
    if (dbError) throw dbError;
    console.log(`📁 Saved Admin record to Database table 'admins' (ID: ${userRecord.id})`);

    console.log("\n=======================================================");
    console.log("🎉 SUPABASE ADMIN USER CREATED SUCCESSFULLY!");
    console.log("=======================================================");
    console.log(`👤 User ID           : ${userRecord.id}`);
    console.log(`📧 Admin Email       : ${EMAIL}`);
    console.log(`🔑 Admin Password    : ${PASSWORD}`);
    console.log("=======================================================\n");

    process.exit(0);

  } catch (err) {
    console.error("❌ Supabase Error:", err.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("💥 Unhandled Error:", err);
  process.exit(1);
});
