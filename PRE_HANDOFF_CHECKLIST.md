# Pre-Handoff QA Checklist

Use this checklist before client delivery. Keep evidence (screenshots or notes) for each step.

## 1) Core accessibility pass

- [ ] Keyboard-only navigation works across public and admin pages.
- [ ] Visible focus ring appears on links, buttons, form fields, and controls.
- [ ] Text contrast is readable on all major sections (header, cards, forms, footer, errors).
- [ ] Every page has one clear H1 and logical heading order beneath it.
- [ ] Form controls have labels and readable validation feedback.

## 2) Content and copy quality

- [ ] Brand/logo alt text appears correctly as "ΕΚΔΟΣΕΙΣ ΤΣΟΤΡΑΣ".
- [ ] No garbled characters in UI text.
- [ ] Login, comments, newsletter, upload, and admin errors use clear human language.
- [ ] Button/link wording is consistent (e.g., "Log in", "Privacy Policy", "Terms of Service").
- [ ] Terms, Privacy, and Cookie pages include current newsletter/Brevo unsubscribe-sync wording.

## 3) Mobile QA breakpoints

Test at widths: **360**, **390**, **768**, **1024**.

- [ ] No horizontal scroll on major pages.
- [ ] Tap targets are easy to press (minimum ~44px height).
- [ ] Header/nav, search, cards, article content, and admin tables/forms remain usable.
- [ ] Modals and sidebars open/close correctly and do not trap layout.

## 4) SEO and trust checks

- [ ] Every page has a useful title and meta description.
- [ ] Canonical URL is present and correct.
- [ ] `robots.txt` is reachable and valid.
- [ ] Terms and Privacy links are visible and working where expected.
- [ ] Cookie Policy link and Cookie Settings action are visible and working.
- [ ] Ads are clearly labeled as sponsored content.

## 5) Stability and security checks

- [ ] Verify server-side validation for comments/newsletter/upload/auth inputs.
- [ ] Verify admin pages require authentication.
- [ ] Verify staff/admin permission checks for protected actions.
- [ ] Confirm API errors do not expose stack traces.
- [ ] Confirm rate limiting works on auth endpoints.

## 6) Functional flow smoke tests

### Auth
- [ ] Login success.
- [ ] Login failure with clear message.
- [ ] Logout redirects correctly.

### Posts
- [ ] Create post.
- [ ] Edit own post.
- [ ] Delete own post.
- [ ] Publish/review flow works for role permissions.

### Comments
- [ ] Add comment.
- [ ] React to comment.
- [ ] Delete own comment.
- [ ] Unauthorized actions return clear feedback.

### Categories
- [ ] Create category.
- [ ] Delete allowed category.
- [ ] Blocked category actions show clear message.

### Newsletter
- [ ] Subscribe from public form.
- [ ] Duplicate email handled gracefully.
- [ ] Admin list/remove subscriber works.
- [ ] Brevo unsubscribe webhook removes the same email from local DB.

### Language switch
- [ ] Header language toggle switches EL/EN labels correctly.
- [ ] Legal pages (`/tos.html`, `/privacy.html`, `/cookies.html`) show only one language block at a time.
- [ ] Newsletter and footer labels are localized after language switch.

## 7) Deployment-ready final pass

- [ ] No console errors on key pages.
- [ ] No broken links in header/footer and admin navigation.
- [ ] All critical assets load (logo, default images, scripts, CSS).
- [ ] Date/version note prepared for client handoff.
