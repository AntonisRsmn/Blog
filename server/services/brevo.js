/**
 * Brevo (formerly Sendinblue) integration.
 *
 * Required env vars:
 *   BREVO_API_KEY   – your Brevo API key (xkeysib-…)
 *   BREVO_LIST_ID   – numeric ID of the contact list to add subscribers to
 *
 * If BREVO_API_KEY is not set the helpers become safe no-ops so the app
 * keeps working without Brevo configured.
 */

const { BrevoClient } = require("@getbrevo/brevo");

const BREVO_API_KEY = (process.env.BREVO_API_KEY || "").trim();
const BREVO_LIST_ID = Number(process.env.BREVO_LIST_ID) || 0;

const isConfigured = Boolean(BREVO_API_KEY && BREVO_LIST_ID);

let client = null;

if (isConfigured) {
  client = new BrevoClient({ apiKey: BREVO_API_KEY });
}

/**
 * Add (or update) a contact in Brevo and assign them to the newsletter list.
 *
 * @param {string}  email       – subscriber email
 * @param {object}  [attributes] – optional Brevo contact attributes
 * @returns {Promise<{success: boolean, alreadyExisted?: boolean, error?: string}>}
 */
async function addContact(email, attributes = {}) {
  if (!isConfigured) {
    return { success: true, skipped: true };
  }

  try {
    await client.contacts.createContact({
      email,
      listIds: [BREVO_LIST_ID],
      updateEnabled: true,
      attributes: {
        SOURCE: attributes.source || "site-footer",
        SOURCE_PATH: attributes.sourcePath || "",
        SIGNUP_DATE: new Date().toISOString()
      }
    });

    return { success: true, alreadyExisted: false };
  } catch (err) {
    const message = String(err?.message || "").toLowerCase();

    // "Contact already exist" is Brevo's duplicate response – not an error
    if (message.includes("duplicate") || message.includes("contact already exist")) {
      // Still make sure they're on the right list
      try {
        await client.contacts.addContactToList(BREVO_LIST_ID, {
          emails: [email]
        });
      } catch {
        // best-effort
      }
      return { success: true, alreadyExisted: true };
    }

    console.error("[Brevo] Failed to add contact:", err?.message || err);
    return { success: false, error: err?.message || "Brevo API error" };
  }
}

/**
 * Remove a contact from the newsletter list (does not delete the contact).
 *
 * @param {string} email
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function removeContactFromList(email) {
  if (!isConfigured) {
    return { success: true, skipped: true };
  }

  try {
    await client.contacts.removeContactFromList(BREVO_LIST_ID, {
      emails: [email]
    });
    return { success: true };
  } catch (err) {
    console.error("[Brevo] Failed to remove contact from list:", err?.message || err);
    return { success: false, error: err?.message || "Brevo API error" };
  }
}

module.exports = {
  isConfigured,
  addContact,
  removeContactFromList
};
