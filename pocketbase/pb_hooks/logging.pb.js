/// <reference path="../pb_data/types.d.ts" />
// Console request logging.
//
// PocketBase's own request log goes to the _logs table, which never reaches
// `docker logs` - so a failing API call leaves no trace on the console, and
// nginx's access log can show the status but not the reason. This mirrors the
// part that matters to stdout: failures always, every request once LOG_LEVEL is
// debug or louder.
//
// Lines are emitted as "<LEVEL> <message>"; docker/log-prefix.awk strips the
// level off and rewrites the line into the container's canonical format.

routerUse((e) => {
  const started = Date.now();

  // Read inside the handler, not at file scope: reading $os while the hook file
  // is being evaluated leaves routerUse unregistered, and PocketBase reports
  // nothing when it happens.
  const logAllRequests =
    ["debug", "trace", "verbose"].indexOf(
      ($os.getenv("LOG_LEVEL") || "").toLowerCase()
    ) !== -1;

  // Only the path, never the query string: PocketBase puts file and auth
  // tokens in there.
  const write = (level, status, detail) => {
    console.log(
      level +
        " " +
        e.request.method +
        " " +
        e.request.url.path +
        " status=" +
        status +
        " duration=" +
        (Date.now() - started) +
        "ms" +
        (detail ? " error=" + JSON.stringify(detail) : "")
    );
  };

  try {
    e.next();
  } catch (err) {
    // API errors surface in the JS VM as a GoError wrapping the response body.
    const api = err && err.value ? err.value : null;
    const status = (api && api.status) || 500;
    const message =
      (api && api.message) || String((err && err.message) || err || "");
    write(status >= 500 ? "ERROR" : "WARN", status, message);
    throw err;
  }

  // Not every response writer PocketBase hands to a middleware tracks the
  // status; an unknown status reads as 0 and is logged like a success.
  let status;
  try {
    status = e.status();
  } catch (_statusError) {
    status = 0;
  }

  if (status >= 500) {
    write("ERROR", status);
  } else if (status >= 400) {
    write("WARN", status);
  } else if (logAllRequests) {
    write("DEBUG", status);
  }
});
