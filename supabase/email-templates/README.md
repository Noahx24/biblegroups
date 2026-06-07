# Auth email templates

Branded HTML for the Supabase Auth emails (ChurchFlow scarlet `#B0202C` on cream `#FAF6EC`,
serif headings to match `src/theme.ts`).

## How to apply

Supabase → **Authentication → Templates**. Open each template, switch to the HTML/source
view, and paste the matching file. Set the subject line shown in each file's header comment.

| File | Supabase template | Suggested subject |
|---|---|---|
| `confirm-signup.html` | Confirm sign up | Confirm your ChurchFlow account |
| `invite-user.html` | Invite user | You've been invited to ChurchFlow |
| `magic-link.html` | Magic link or OTP | Your ChurchFlow sign-in link |
| `change-email.html` | Change email address | Confirm your new ChurchFlow email address |
| `reset-password.html` | Reset password | Reset your ChurchFlow password |
| `reauthentication.html` | Reauthentication | Your ChurchFlow verification code |

## Template variables used

These are Supabase's Go template tokens — leave them exactly as written:

- `{{ .ConfirmationURL }}` — action link (all except Reauthentication)
- `{{ .Token }}` — 6-digit one-time code (confirm, magic link, change email, reset, reauth)
- `{{ .Email }}` / `{{ .NewEmail }}` — old/new address (change email only)

Reauthentication is code-only — Supabase does not provide a link for that flow.

## Notes

- All CSS is inlined because most email clients strip `<style>` blocks.
- Buttons use a rounded `<td>` background so the shape renders in Outlook too.
- If you only use magic links (not OTP), you can delete the code block from
  `magic-link.html`; likewise drop the button if you only use OTP.
