/* The small helpers every screen and document depends on.
 *
 * escapeHtml is the important one. Without it an ordinary name like
 * `Smith & Sons <Reception>` is swallowed as an HTML tag and silently
 * disappears from the owner's binder. Route EVERY user value through it
 * before it reaches innerHTML or a print document.
 *
 * sha256 stores a privacy PIN as a one-way hash. It is a privacy screen,
 * not encryption -- say so in the app and in the listing.
 */

const escapeHtml = (val) => {
            if (val === null || val === undefined) return '';

const sha256 = async (text) => {
            const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));

const formatDate = (val) => {
            if(!val) return '';

const formatMoney = (val) => {
            let num = parseFloat(val) || 0;

const daysUntil = (val) => {
            if (!val) return null;

const itemDate = (item, sectionKey) => {
            if (!item) return '';
