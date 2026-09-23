/**
 * supabaseHelpers.js
 *
 * A drop-in replacement for supabaseHelpers.js allowing the vast controller layer
 * to seamlessly interact with Supabase PostgreSQL without any API contract changes.
 */

const { getSupabase } = require("./supabaseClient");

/**
 * Get a single document by its ID.
 */
async function docById(collection, id) {
  try {
    const { data, error } = await getSupabase()
      .from(collection)
      .select("*")
      .eq("id", id)
      .maybeSingle();
      
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * Maps firestore operator arrays to Supabase PostgREST builder functions.
 */
function applyFilters(queryBuilder, filters) {
  for (const [field, op, value] of filters) {
    if (value === undefined) continue;
    switch (op) {
      case "==":
        queryBuilder = queryBuilder.eq(field, value);
        break;
      case "!=":
        queryBuilder = queryBuilder.neq(field, value);
        break;
      case "in":
        if (Array.isArray(value) && value.length === 0) {
            // Firestore shortcut: in [] means 0 results. 
            // In SQL, IN () might throw syntax error on some drivers, so we force a false condition
            queryBuilder = queryBuilder.in(field, [null]); 
        } else {
            queryBuilder = queryBuilder.in(field, value);
        }
        break;
      case "<":
        queryBuilder = queryBuilder.lt(field, value);
        break;
      case "<=":
        queryBuilder = queryBuilder.lte(field, value);
        break;
      case ">":
        queryBuilder = queryBuilder.gt(field, value);
        break;
      case ">=":
        queryBuilder = queryBuilder.gte(field, value);
        break;
      case "array-contains":
        queryBuilder = queryBuilder.contains(field, [value]);
        break;
      default:
        // Default to strict equality
        queryBuilder = queryBuilder.eq(field, value);
    }
  }
  return queryBuilder;
}

/**
 * Get documents matching filters with optional sorting/limits.
 */
async function queryDocs(collection, filters = [], opts = {}) {
  try {
    let q = getSupabase().from(collection).select("*");
    
    q = applyFilters(q, filters);
    
    if (opts.orderBy) {
       q = q.order(opts.orderBy, { ascending: opts.direction !== "desc" });
    }
    if (opts.limit) {
       q = q.limit(opts.limit);
    }
    
    const { data, error } = await q;
    return { data, error };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * Get ALL documents in a collection, optionally ordered.
 */
async function allDocs(collection, opts = {}) {
  return queryDocs(collection, [], opts);
}

/**
 * Count documents matching filters efficiently using Postgres Count
 */
async function countDocs(collection, filters = []) {
  try {
      let q = getSupabase().from(collection).select("*", { count: "exact", head: true });
      q = applyFilters(q, filters);
      
      const { count, error } = await q;
      if (error) return 0;
      return count || 0;
  } catch {
      return 0;
  }
}

// ── Write helpers ───────────────────────────────────────────────────────────

/**
 * Add a new document. Since Supabase tables usually have default uuid IDs or serials,
 * we just insert.
 */
async function addDoc(collection, fields, generateTimestamp = true) {
  try {
    const payload = {
      ...fields,
    };
    if (generateTimestamp) {
      payload.created_at = fields.created_at || new Date().toISOString();
    }
    const { data, error } = await getSupabase()
      .from(collection)
      .insert([payload])
      .select()
      .maybeSingle();
      
    if (error) return { data: null, error };
    return { data, error: null };
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * Update a document by ID.
 */
async function updateDoc(collection, id, fields) {
  try {
    const { error } = await getSupabase()
      .from(collection)
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", id);
    return { error };
  } catch (e) {
    return { error: e };
  }
}

/**
 * Set (merge) a document by ID. Supabase eq works with upsert.
 */
async function setDoc(collection, id, fields) {
  try {
    // Supabase upsert relies on primary key
    const payload = { id, ...fields };
    const { error } = await getSupabase()
      .from(collection)
      .upsert([payload]);
    return { error };
  } catch (e) {
    return { error: e };
  }
}

/**
 * Delete a document by ID.
 */
async function deleteDoc(collection, id) {
  try {
    const { error } = await getSupabase().from(collection).delete().eq("id", id);
    return { error };
  } catch (e) {
    return { error: e };
  }
}

/**
 * Delete all documents matching filters.
 */
async function deleteDocs(collection, filters = []) {
  try {
    let q = getSupabase().from(collection).delete();
    q = applyFilters(q, filters);
    const { error } = await q;
    return { error };
  } catch (e) {
    return { error: e };
  }
}

/**
 * Upsert by a unique field value (e.g., upsert attendance by quiz_id + student_id).
 */
async function upsertDoc(collection, filters, fields, generateTimestamp = true) {
  try {
    const { data: existing } = await queryDocs(collection, filters);
    if (existing && existing.length > 0) {
      const { data, error } = await getSupabase()
          .from(collection)
          .update(fields)
          .eq("id", existing[0].id)
          .select()
          .maybeSingle();
      return { data, error };
    }
    return addDoc(collection, fields, generateTimestamp);
  } catch (e) {
    return { data: null, error: e };
  }
}

/**
 * Get a document by field value (like .eq().maybeSingle()).
 */
async function docByField(collection, field, value) {
  const { data, error } = await queryDocs(collection, [[field, "==", value]], { limit: 1 });
  if (error) return { data: null, error };
  return { data: data && data.length > 0 ? data[0] : null, error: null };
}

/**
 * Batch write multiple documents.
 */
async function batchAdd(collection, docsArray) {
  try {
    const payloads = docsArray.map(doc => ({
        ...doc, 
        created_at: new Date().toISOString()
    }));
    
    // Supabase supports bulk inserts via an array payload
    const { error } = await getSupabase()
      .from(collection)
      .insert(payloads);
      
    return { error };
  } catch (e) {
    return { error: e };
  }
}

module.exports = {
  docById,
  queryDocs,
  allDocs,
  countDocs,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  deleteDocs,
  upsertDoc,
  docByField,
  batchAdd,
};
