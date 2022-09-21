import { SMTPServer } from "smtp-server";
import { createTransport } from "nodemailer";
import { ParsedMail, simpleParser } from "mailparser";
import Mail from "nodemailer/lib/mailer";

import Config, { IAliasOptions, ITransportOptions } from "./config";

const parsedMail2Mail = (mail: ParsedMail): Mail.Options => {
  return {
    headers: mail.headerLines.reduce((a, { key, line }) => {
      // Remove these headers to let them be correctly generated later by nodemailer
      if (["content-type", "mime-version", "message-id"].indexOf(key) !== -1)
        return a;
      const [k, v] = line.split(": ", 2);
      a[k] = v;
      return a;
    }, {} as any),
    attachments: mail.attachments.map((attachment) => {
      return {
        filename: attachment.filename,
        contentDisposition: attachment.contentDisposition as
          | "inline"
          | "attachment",
        contentType: attachment.contentType,
        content: attachment.content,
      };
    }),
    text: mail.text,
    html: mail.html ? mail.html : undefined,
  };
};

(async () => {
  if (!process.argv[2]) throw new Error("Missing configuration file");
  const config = Config(process.argv[2]);

  if (!!process.env.VERIFY) {
    for (const alias of config.aliases) {
      for (const transport of alias.transports) {
        const transporter = createTransport(transport.smtp);
        await transporter.verify();
        transporter.close();
      }
    }
  }

  const server = new SMTPServer({
    ...config.smtp,
    onAuth: (auth, session, callback) => {
      if (!auth.username || !auth.password) {
        return callback(new Error("Missing username and/or password"));
      }

      for (const alias of config.aliases) {
        if (auth.username === alias.user && auth.password === alias.pass) {
          return callback(null, { user: alias });
        }
      }

      return callback(new Error("Invalid username and/or password"));
    },
    onData: async (stream, session, callback) => {
      try {
        const parsedMail = await simpleParser(stream);
        console.log(parsedMail);

        if (stream.sizeExceeded)
          return callback(new Error("Size exceeded"));

        const mail = parsedMail2Mail(parsedMail);
        const headers = mail.headers as { [key: string]: string };

        const alias: IAliasOptions = session.user as any;
        const transport: ITransportOptions | undefined = alias.transports.find(
          (transport) => {
            const matches = headers["From"].match(/<(.*?)>/);
            if (!matches || matches?.length !== 2) return false;
            return RegExp(transport.match).test(matches[1]);
          }
        );

        if (!transport)
          return callback(new Error("Unable to resolve tranport"));

        const transporter = createTransport({
          ...transport.smtp,
        });

        if (transport.overwrite_sender)
          (mail.headers as any)["Sender"] = headers["From"];

        console.log(transport.smtp.host, await transporter.sendMail(mail));

        transporter.close();
        callback();
      } catch (err: any) {
        console.error(err);
        callback(err);
      }
    },
  });

  server.on("error", console.error);

  server.listen(config.smtp.port);

  process.on("SIGINT", () => server.close());
  process.on("SIGTERM", () => server.close());
})();
