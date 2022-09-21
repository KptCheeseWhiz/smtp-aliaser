import { readFileSync } from "fs";

import SMTPTransport from "nodemailer/lib/smtp-transport";
import { SMTPServerOptions } from "smtp-server";

export interface IAliasOptions {
  user: string;
  pass: string;
  transports: ITransportOptions[];
}

export interface ITransportOptions {
  match: string;
  overwrite_sender: boolean;
  smtp: SMTPTransport.Options;
}

export default (
  file: string
): {
  smtp: SMTPServerOptions & { port: number };
  aliases: IAliasOptions[];
} => {
  const json = JSON.parse(readFileSync(file).toString());
  return {
    smtp: {
      name: "<3",
      disableReverseLookup: true,
      allowInsecureAuth: false,
      authOptional: false,
      size: 20480000,
      port: 587,
      ...json.smtp,
      key: json.smtp?.key ? readFileSync(json.smtp.key) : undefined,
      cert: json.smtp?.cert ? readFileSync(json.smtp.cert) : undefined,
      logger: true,
      authMethods: ["LOGIN", "PLAIN"],
    },
    aliases: json.aliases.map((alias: any) => {
      return {
        user: alias.user,
        pass: alias.pass,
        transports: alias.transports.map((transport: any) => {
          return {
            match: transport.match,
            overwrite_sender: !!transport.overwrite_sender,
            smtp: {
              ...transport.smtp,
              logger: true,
            },
          };
        }),
      };
    }),
  };
};
