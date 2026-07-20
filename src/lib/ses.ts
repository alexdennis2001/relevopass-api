import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";

const sesClient = new SESv2Client({ region: process.env.AWS_REGION });

const FROM_EMAIL = process.env.SES_FROM_EMAIL ?? "notificaciones@email.dtech.mx";
const FROM_NAME = process.env.SES_FROM_NAME ?? "Notificaciones Dtech";
const FROM_ADDRESS = `"${FROM_NAME}" <${FROM_EMAIL}>`;

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail(input: SendEmailInput): Promise<void> {
  await sesClient.send(
    new SendEmailCommand({
      FromEmailAddress: FROM_ADDRESS,
      Destination: { ToAddresses: [input.to] },
      Content: {
        Simple: {
          Subject: { Data: input.subject, Charset: "UTF-8" },
          Body: {
            Html: { Data: input.html, Charset: "UTF-8" },
            Text: { Data: input.text, Charset: "UTF-8" },
          },
        },
      },
    })
  );
}
