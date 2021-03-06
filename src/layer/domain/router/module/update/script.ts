import { Cancellee } from 'spica/cancellation';
import { Either, Left, Right } from 'spica/either';
import { concat } from 'spica/concat';
import { once } from 'typed-dom';
import { find } from '../../../../../lib/dom';
import { FatalError } from '../../../../../lib/error';
import { StandardUrl, standardizeUrl } from '../../../../data/model/domain/url';

type Response = [HTMLScriptElement, string];

export async function script(
  documents: {
    src: Document;
    dst: Document;
  },
  skip: ReadonlySet<StandardUrl>,
  selector: {
    ignore: string;
    reload: string;
    logger: string;
  },
  cancellation: Cancellee<Error>,
  io = {
    request,
    evaluate,
  }
): Promise<Either<Error, HTMLScriptElement[]>> {
  const scripts = find(documents.src, 'script')
    .filter(el => !el.type || /(?:application|text)\/(?:java|ecma)script/i.test(el.type))
    .filter(el => !el.matches(selector.ignore.trim() || '_'))
    .filter(el =>
      el.hasAttribute('src')
        ? !skip.has(standardizeUrl(el.src)) || el.matches(selector.reload.trim() || '_')
        : true);
  const requests = scripts
    .reduce<Promise<Either<Error, Response>>[]>((rs, script) =>
      concat(rs, [io.request(script)])
    , []);
  return (await Promise.all(requests))
    .reduce<Either<Error, HTMLScriptElement[]>>((acc, m) =>
      m.bind(res => run(acc, res))
    , Right([]));

  function run(
    state: Either<Error, HTMLScriptElement[]>,
    response: Response
  ): Either<Error, HTMLScriptElement[]> {
    return state
      .bind(cancellation.either)
      .bind<HTMLScriptElement[]>(scripts =>
        io.evaluate(response, selector.logger)
          .fmap(script =>
            scripts.concat([script])));
  }
}

export function escape(script: HTMLScriptElement): () => undefined {
  const src: string | null = script.hasAttribute('src') ? script.getAttribute('src') : null;
  const code = script.innerHTML;
  void script.removeAttribute('src');
  script.innerHTML = '';
  return () => (
    script.innerHTML = ' ',
    script.innerHTML = code,
    typeof src === 'string'
      ? void script.setAttribute('src', src)
      : void 0);
}

async function request(script: HTMLScriptElement): Promise<Either<Error, Response>> {
  if (script.hasAttribute('src')) {
    const xhr = new XMLHttpRequest();
    void xhr.open('GET', script.src, true);
    void xhr.send();
    return new Promise<Either<Error, Response>>(resolve =>
      ['load', 'abort', 'error', 'timeout']
        .forEach(type => {
          switch (type) {
            case 'load':
              return void xhr.addEventListener(
                type,
                () => void resolve(Right<Response>([script, xhr.response as string])));
            default:
              return void xhr.addEventListener(
                type,
                () => void resolve(Left(new Error(`${script.src}: ${xhr.statusText}`))));
          }
        }));
  }
  else {
    return Right<Response>([script, script.innerHTML]);
  }
}
export { request as _request }

function evaluate([script, code]: Response, logger: string): Either<Error, HTMLScriptElement> {
  const logging = script.parentElement && script.parentElement.matches(logger.trim() || '_');
  const container = document.querySelector(
    logging
      ? script.parentElement!.id
        ? `#${script.parentElement!.id}`
        : script.parentElement!.tagName
      : '_') || document.body;
  script = script.ownerDocument === document
    ? script // only for testing
    : document.importNode(script.cloneNode(true), true) as HTMLScriptElement;
  let error: Error | void = void 0;
  const unbind = once(window, 'error', ev => {
    error = ev.error;
  });
  if (script.hasAttribute('src')) {
    const src = script.getAttribute('src')!;
    void script.removeAttribute('src');
    script.innerHTML = `
document.currentScript.innerHTML = '';
document.currentScript.setAttribute('src', "${src.replace(/"/g, encodeURI)}");
${code}`;
  }
  else {
    script.innerHTML = `
document.currentScript.innerHTML = document.currentScript.innerHTML.slice(-${code.length});
${code}`;
  }
  assert(container.closest('html') === document.documentElement);
  void container.appendChild(script);
  assert(error === void 0 || error as Error instanceof Error);
  void unbind();
  if (script.hasAttribute('src')) {
    void script.dispatchEvent(new Event(error ? 'error' : 'load'));
  }
  if (!logging) {
    void script.remove();
  }
  return error
    ? Left(new FatalError((error as Error).message))
    : Right(script);
}
export { evaluate as _evaluate }
