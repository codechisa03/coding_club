const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://vvnfxujdcombyeukbqto.supabase.co";
const JWT_SECRET = "5l9tMLyw5gr6ZLJG4XdFh2ofeoRMjDncDT/JcBP9Lb1RzseR5Qcfsf3WG7A/XTOdvRtMlVYT72DwN/1wbgDVoQ==";

// Decode the JWT Secret from base64 if needed, although often it's passed as string. Wait, Supabase requires you to NOT base64 decode it maybe?
let secretBuf;
try {
  secretBuf = Buffer.from(JWT_SECRET, 'utf8'); // or 'base64'? 
} catch (e) { secretBuf = JWT_SECRET; }

const serviceRolePayload = {
  role: "service_role",
  iss: "supabase",
  iat: Math.floor(Date.now() / 1000) - 30, // some leeway
  exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365,
};

// Try base64 decoded secret?
const b64Secret = Buffer.from(JWT_SECRET, "base64");
const serviceRoleKey = jwt.sign(serviceRolePayload, b64Secret, { algorithm: "HS256" });

async function run() {
  const supabase = createClient(SUPABASE_URL, serviceRoleKey);
  const { data, error } = await supabase.auth.admin.listUsers();
  
  if (error) {
    console.error("Test Failed with base64 decoded:", error.message);
  } else {
    console.log("Test Success! Users:", data.users.length);
  }
}

run();
