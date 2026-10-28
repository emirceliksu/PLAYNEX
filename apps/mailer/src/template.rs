use serde::Deserialize;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum Purpose {
    Verification,
    PasswordReset,
    SignIn,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeMail {
    pub purpose: Purpose,
    pub to: String,
    pub first_name: String,
    pub code: String,
    pub locale: String,
    pub valid_minutes: u32,
}

#[derive(Deserialize)]
struct PurposeCopy {
    subject: String,
    preheader: String,
    eyebrow: String,
    heading: String,
    intro: String,
    ignore: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Catalog {
    greeting: String,
    code_label: String,
    expiry: String,
    tagline: String,
    automated: String,
    verification: PurposeCopy,
    password_reset: PurposeCopy,
    sign_in: PurposeCopy,
}

pub struct Rendered {
    pub subject: String,
    pub text: String,
    pub html: String,
}

/// Content-ID of the mark attached to every message; the HTML points at it with `cid:`.
pub const MARK_CID: &str = "playnex-mark";

// Mail clients ignore the token stylesheet, so the palette is written out here. Values are
// the dark theme from packages/design-tokens: surface canvas/raised/overlay, fg primary/
// secondary/muted, brand solid and soft text, yellow solid.
const CANVAS: &str = "#0f101e";
const RAISED: &str = "#1a1b2c";
const OVERLAY: &str = "#2b2c3e";
const FG: &str = "#f8f8fc";
const FG_SECONDARY: &str = "#c2c3cf";
const FG_MUTED: &str = "#9c9dab";
const BRAND: &str = "#7f60ff";
const BRAND_SOFT_TEXT: &str = "#cfccff";
const YELLOW: &str = "#ffc62d";

const DISPLAY_FONT: &str = "'Space Grotesk',Arial,Helvetica,sans-serif";
const BODY_FONT: &str = "'Plus Jakarta Sans',Arial,Helvetica,sans-serif";

pub struct Templates {
    tr: Catalog,
    en: Catalog,
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

impl Templates {
    pub fn load() -> Result<Self, serde_json::Error> {
        Ok(Self {
            tr: serde_json::from_str(include_str!("../messages/tr.json"))?,
            en: serde_json::from_str(include_str!("../messages/en.json"))?,
        })
    }

    pub fn render(&self, mail: &CodeMail) -> Rendered {
        let (catalog, lang) = if mail.locale == "en" {
            (&self.en, "en")
        } else {
            (&self.tr, "tr")
        };
        let copy = match mail.purpose {
            Purpose::Verification => &catalog.verification,
            Purpose::PasswordReset => &catalog.password_reset,
            Purpose::SignIn => &catalog.sign_in,
        };
        let minutes = mail.valid_minutes.to_string();
        let fill = |text: &str| {
            text.replace("{code}", &mail.code)
                .replace("{minutes}", &minutes)
                .replace("{name}", &mail.first_name)
        };

        let subject = fill(&copy.subject);
        let greeting = fill(&catalog.greeting);
        let expiry = fill(&catalog.expiry);
        let preheader = fill(&copy.preheader);

        let text = format!(
            "{greeting}\n\n{intro}\n\n{label}: {code}\n\n{expiry}\n\n{ignore}\n\n--\nPLAYNEX\n{tagline}\n",
            intro = copy.intro,
            label = catalog.code_label,
            code = mail.code,
            ignore = copy.ignore,
            tagline = catalog.tagline,
        );

        let html = format!(
            r#"<!doctype html>
<html lang="{lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>{subject}</title>
</head>
<body style="margin:0;padding:0;background:{CANVAS};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{CANVAS};">{preheader}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:{CANVAS};">
<tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;">
    <tr><td style="padding:0 4px 28px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
        <td style="vertical-align:middle;"><img src="cid:{MARK_CID}" width="48" height="48" alt="" style="display:block;border:0;"></td>
        <td style="vertical-align:middle;padding-left:12px;font-family:{DISPLAY_FONT};font-size:24px;font-weight:700;letter-spacing:-0.02em;color:{FG};">PLAY<span style="color:{BRAND_SOFT_TEXT};">NEX</span></td>
      </tr></table>
    </td></tr>
    <tr><td style="background:{RAISED};border:2px solid {OVERLAY};border-radius:16px;padding:32px 28px;">
      <p style="margin:0 0 12px;font-family:{DISPLAY_FONT};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:{YELLOW};">{eyebrow}</p>
      <h1 style="margin:0 0 20px;font-family:{DISPLAY_FONT};font-size:28px;line-height:1.15;font-weight:700;letter-spacing:-0.02em;color:{FG};">{heading}</h1>
      <p style="margin:0 0 8px;font-family:{BODY_FONT};font-size:16px;line-height:1.55;color:{FG};">{greeting}</p>
      <p style="margin:0 0 28px;font-family:{BODY_FONT};font-size:16px;line-height:1.55;color:{FG_SECONDARY};">{intro}</p>
      <p style="margin:0 0 10px;font-family:{DISPLAY_FONT};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:{FG_MUTED};">{code_label}</p>
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;"><tr>
        <td style="background:{CANVAS};border:2px solid {FG};border-radius:12px;box-shadow:5px 5px 0 {BRAND};padding:14px 22px;font-family:{DISPLAY_FONT},Consolas,monospace;font-size:36px;line-height:1;font-weight:700;letter-spacing:0.28em;color:{FG};">{code}</td>
        <td style="width:5px;"></td>
      </tr></table>
      <p style="margin:0 0 24px;font-family:{BODY_FONT};font-size:14px;line-height:1.5;color:{FG_SECONDARY};">{expiry}</p>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="border-top:2px solid {OVERLAY};font-size:0;line-height:0;">&nbsp;</td></tr></table>
      <p style="margin:20px 0 0;font-family:{BODY_FONT};font-size:13px;line-height:1.5;color:{FG_MUTED};">{ignore}</p>
    </td></tr>
    <tr><td style="padding:24px 4px 0;font-family:{BODY_FONT};font-size:12px;line-height:1.6;color:{FG_MUTED};">
      <span style="font-family:{DISPLAY_FONT};font-weight:700;color:{FG_SECONDARY};">PLAYNEX</span> &middot; {tagline}<br>{automated}
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>"#,
            subject = escape_html(&subject),
            preheader = escape_html(&preheader),
            eyebrow = escape_html(&copy.eyebrow),
            heading = escape_html(&copy.heading),
            greeting = escape_html(&greeting),
            intro = escape_html(&copy.intro),
            code_label = escape_html(&catalog.code_label),
            code = escape_html(&mail.code),
            expiry = escape_html(&expiry),
            ignore = escape_html(&copy.ignore),
            tagline = escape_html(&catalog.tagline),
            automated = escape_html(&catalog.automated),
        );

        Rendered {
            subject,
            text,
            html,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mail(purpose: Purpose, first_name: &str) -> CodeMail {
        CodeMail {
            purpose,
            to: "oyuncu@example.com".into(),
            first_name: first_name.into(),
            code: "042917".into(),
            locale: "tr".into(),
            valid_minutes: 15,
        }
    }

    #[test]
    fn each_purpose_has_its_own_subject() {
        let templates = Templates::load().unwrap();
        let verification = templates.render(&mail(Purpose::Verification, "Deniz"));
        let reset = templates.render(&mail(Purpose::PasswordReset, "Deniz"));
        let sign_in = templates.render(&mail(Purpose::SignIn, "Deniz"));
        assert!(verification.subject.contains("042917"));
        assert_ne!(verification.subject, reset.subject);
        assert_ne!(sign_in.subject, verification.subject);
        assert_ne!(sign_in.subject, reset.subject);
        assert!(reset.html.contains(&format!("cid:{MARK_CID}")));
    }

    #[test]
    fn names_are_escaped_in_html() {
        let rendered = Templates::load()
            .unwrap()
            .render(&mail(Purpose::Verification, "<script>"));
        assert!(!rendered.html.contains("<script>"));
        assert!(rendered.html.contains("&lt;script&gt;"));
    }
}
