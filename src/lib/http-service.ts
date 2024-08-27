import http from 'http';
import { Logging } from 'homebridge';

export interface AutomationReturn {
  error: boolean;
  message: string;
  cooldownActive?: boolean;
}

export type HttpHandler = (json: object) => AutomationReturn;

export class HttpService {
  private readonly server: http.Server;

  constructor(private httpPort: number, private logger: Logging) {
      this.logger.info('Setting up HTTP server on port ' + this.httpPort + '...');
      this.server = http.createServer();
  }

  start(httpHandler: HttpHandler) {
      this.server.listen(this.httpPort);
      this.server.on(
          'request',
          (request: http.IncomingMessage, response: http.ServerResponse) => {

						if (request.method == 'POST') {
								var body = '';

								request.on('data', function (data) {
										body += data;

										// Too much POST data, kill the connection!
										// 1e6 === 1 * Math.pow(10, 6) === 1 * 1000000 ~~~ 1MB
										if (body.length > 1e6)
												request.connection.destroy();
								});

								request.on('end', function () {
										const json = JSON.parse(body);
              let results: AutomationReturn = {
                  error: true,
                  message: 'Malformed URL.',
              };
              if (request.url) {
                  results = httpHandler(json);
              }
              response.writeHead(results.error ? 500 : 200);
              response.write(JSON.stringify(results));
              response.end();
								});
						} else {
              let results: AutomationReturn = {
                  error: true,
                  message: 'Malformed URL.',
              };
              if (request.url) {
                  results = httpHandler(request);
              }
              response.writeHead(results.error ? 500 : 200);
              response.write(JSON.stringify(results));
              response.end();
						}
          },
      );
  }
}
