import { LOGO_DATA_URI } from "./logoBase64";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type StepNotificationEmailData = {
  recipientFirstName: string;
  headline: string;
  intro: string;
  processName: string;
  stepTitle: string;
  stepDescription: string | null;
  stepPosition: number;
  totalSteps: number;
  adminName: string;
  activatedAt: Date;
  pendingSubsteps: string;
  processUrl: string;
};

export function renderStepNotificationEmail(
  data: StepNotificationEmailData
): { html: string; text: string } {
  const currentYear = new Date().getFullYear();
  const activationDate = data.activatedAt.toLocaleString("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
  });
  const description = data.stepDescription?.trim() || "Sin descripción.";

  const html = `
<div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; font-size: 14px; color: #212121; background-color: #f3f5f8; padding: 32px 16px;">
  <div style="max-width: 600px; margin: auto; background-color: #096043; border-radius: 28px; overflow: hidden; box-shadow: 0 8px 24px rgba(9, 96, 67, 0.15);">

    <!-- Header -->
    <div style="text-align: center; background-color: #096043; padding: 28px 24px 20px;">
      <img
        src="${LOGO_DATA_URI}"
        alt="RelevoPass"
        width="200"
        height="68"
        style="display: block; margin: 0 auto; width: 200px; height: auto; max-width: 100%;"
      />
      <p style="margin: 8px 0 0; color: #c8ddd2; font-size: 14px;">
        Gestión y seguimiento de procesos
      </p>
    </div>

    <!-- Body -->
    <div style="padding: 8px 24px 28px; color: #ffffff; text-align: left;">

      <h1 style="font-size: 22px; line-height: 1.3; margin: 16px 0; text-align: center;">
        ${escapeHtml(data.headline)}
      </h1>

      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
        Hola <strong>${escapeHtml(data.recipientFirstName)}</strong>,
      </p>

      <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
        ${escapeHtml(data.intro)}
      </p>

      <!-- Process Information -->
      <div style="background-color: #ffffff; color: #17202a; border-radius: 16px; padding: 20px; font-size: 14px;">

        <p style="margin: 0 0 16px; font-size: 16px; color: #096043;">
          <strong>Información del proceso</strong>
        </p>

        <table role="presentation" style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 8px 0; color: #667085; width: 38%; vertical-align: top;">
              Proceso:
            </td>
            <td style="padding: 8px 0; font-weight: 600; vertical-align: top;">
              ${escapeHtml(data.processName)}
            </td>
          </tr>

          <tr>
            <td style="padding: 8px 0; color: #667085; vertical-align: top;">
              Paso actual:
            </td>
            <td style="padding: 8px 0; font-weight: 600; vertical-align: top;">
              ${escapeHtml(data.stepTitle)}
            </td>
          </tr>

          <tr>
            <td style="padding: 8px 0; color: #667085; vertical-align: top;">
              Posición:
            </td>
            <td style="padding: 8px 0; font-weight: 600; vertical-align: top;">
              Paso ${data.stepPosition} de ${data.totalSteps}
            </td>
          </tr>

          <tr>
            <td style="padding: 8px 0; color: #667085; vertical-align: top;">
              Creado por:
            </td>
            <td style="padding: 8px 0; font-weight: 600; vertical-align: top;">
              ${escapeHtml(data.adminName)}
            </td>
          </tr>

          <tr>
            <td style="padding: 8px 0; color: #667085; vertical-align: top;">
              Fecha de activación:
            </td>
            <td style="padding: 8px 0; font-weight: 600; vertical-align: top;">
              ${activationDate}
            </td>
          </tr>

          <tr>
            <td style="padding: 8px 0; color: #667085; vertical-align: top;">
              Subprocesos pendientes:
            </td>
            <td style="padding: 8px 0; font-weight: 600; vertical-align: top;">
              ${escapeHtml(data.pendingSubsteps)}
            </td>
          </tr>
        </table>

        <!-- Description -->
        <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #e4e7ec;">
          <p style="margin: 0 0 6px; color: #667085;">
            Descripción del paso:
          </p>

          <p style="margin: 0; line-height: 1.6;">
            ${escapeHtml(description)}
          </p>
        </div>
      </div>

      <!-- CTA Button -->
      <div style="text-align: center; margin-top: 28px;">
        <a
          href="${data.processUrl}"
          style="display: inline-block; background-color: #ffffff; color: #096043; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 10px;"
        >
          Revisar proceso
        </a>
      </div>

      <p style="margin: 24px 0 0; font-size: 13px; line-height: 1.6; color: #c8ddd2; text-align: center;">
        Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:
      </p>

      <p style="margin: 8px 0 0; font-size: 12px; line-height: 1.5; color: #ffffff; text-align: center; word-break: break-all;">
        ${data.processUrl}
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align: center; background-color: #074d36; color: #c8ddd2; padding: 20px 24px;">
      <p style="margin: 4px 0; font-size: 13px;">
        Correo enviado automáticamente por la plataforma RelevoPass.
      </p>

      <p style="margin: 4px 0; font-size: 13px;">
        No respondas directamente a este mensaje.
      </p>

      <p style="margin: 12px 0 0; font-size: 12px; color: #8fa9c9;">
        © ${currentYear} RelevoPass. Todos los derechos reservados.
      </p>
    </div>
  </div>
</div>
`.trim();

  const text = `${data.headline}

Hola ${data.recipientFirstName},

${data.intro}

Información del proceso:
- Proceso: ${data.processName}
- Paso actual: ${data.stepTitle}
- Posición: Paso ${data.stepPosition} de ${data.totalSteps}
- Creado por: ${data.adminName}
- Fecha de activación: ${activationDate}
- Subprocesos pendientes: ${data.pendingSubsteps}

Descripción del paso: ${description}

Revisar proceso: ${data.processUrl}

—
Correo enviado automáticamente por la plataforma RelevoPass. No respondas directamente a este mensaje.
© ${currentYear} RelevoPass. Todos los derechos reservados.`;

  return { html, text };
}
