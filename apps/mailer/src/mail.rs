use crate::{
    config::{Config, MailTransport, SmtpConfig, SmtpSecurity},
    gmail::GmailTransport,
    template::{CodeMail, MARK_CID, Templates},
};
use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    message::{Attachment, Mailbox, MultiPart, SinglePart, header::ContentType},
    transport::smtp::authentication::Credentials,
};

const MARK_PNG: &[u8] = include_bytes!("../assets/mark.png");

enum Transport {
    Smtp(AsyncSmtpTransport<Tokio1Executor>),
    Gmail(GmailTransport),
}

pub struct Mailer {
    transport: Transport,
    from: Mailbox,
    templates: Templates,
}

#[derive(Debug, thiserror::Error)]
pub enum MailError {
    #[error("invalid address: {0}")]
    Address(#[from] lettre::address::AddressError),
    #[error("could not build message: {0}")]
    Build(#[from] lettre::error::Error),
    #[error("smtp: {0}")]
    Smtp(#[from] lettre::transport::smtp::Error),
    #[error("content type: {0}")]
    ContentType(#[from] lettre::message::header::ContentTypeErr),
    #[error("message catalog: {0}")]
    Catalog(#[from] serde_json::Error),
    #[error("service account key: {0}")]
    ServiceAccount(String),
    #[error("signing token request: {0}")]
    Jwt(#[from] jsonwebtoken::errors::Error),
    #[error("http: {0}")]
    Http(#[from] reqwest::Error),
    #[error("gmail api returned {status}: {body}")]
    Gmail { status: u16, body: String },
}

fn smtp_transport(config: &SmtpConfig) -> Result<AsyncSmtpTransport<Tokio1Executor>, MailError> {
    let builder = match config.security {
        SmtpSecurity::None => AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&config.host),
        SmtpSecurity::StartTls => {
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&config.host)?
        }
        SmtpSecurity::Tls => AsyncSmtpTransport::<Tokio1Executor>::relay(&config.host)?,
    }
    .port(config.port);
    let builder = match (&config.username, &config.password) {
        (Some(username), Some(password)) => {
            builder.credentials(Credentials::new(username.clone(), password.clone()))
        }
        _ => builder,
    };
    Ok(builder.build())
}

impl Mailer {
    pub fn new(config: &Config) -> Result<Self, MailError> {
        let from: Mailbox = config.from.parse()?;
        let transport = match &config.transport {
            MailTransport::Smtp(smtp) => Transport::Smtp(smtp_transport(smtp)?),
            // The delegated Workspace user is the From address; Gmail rejects any other sender.
            MailTransport::Gmail { service_account } => Transport::Gmail(GmailTransport::new(
                service_account,
                from.email.to_string(),
            )?),
        };

        Ok(Self {
            transport,
            from,
            templates: Templates::load()?,
        })
    }

    pub async fn send(&self, mail: &CodeMail) -> Result<(), MailError> {
        let rendered = self.templates.render(mail);
        // Embedding the mark keeps the header intact in clients that block remote images
        // and leaves the mail independent of where the site is hosted.
        let mark = Attachment::new_inline(MARK_CID.to_owned())
            .body(MARK_PNG.to_vec(), ContentType::parse("image/png")?);
        let body = MultiPart::alternative()
            .singlepart(SinglePart::plain(rendered.text))
            .multipart(
                MultiPart::related()
                    .singlepart(SinglePart::html(rendered.html))
                    .singlepart(mark),
            );

        let message = Message::builder()
            .from(self.from.clone())
            .to(mail.to.parse()?)
            .subject(rendered.subject)
            .multipart(body)?;
        match &self.transport {
            Transport::Smtp(smtp) => {
                smtp.send(message).await?;
            }
            Transport::Gmail(gmail) => gmail.send(&message.formatted()).await?,
        }
        Ok(())
    }
}
