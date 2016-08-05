import { Pjax } from 'pjax-api';
import { parse } from '../../../src/layer/application/api';
import { once } from '../../../src/lib/dom';

describe('Integration: Usecase', function () {
  describe('multibyte', function () {
    it('basic', function (done) {
      const url = '/base/test/integration/usecase/fixture/multibyte/あアｱ亜.html';
      const document = parse('').extract();
      new Pjax({}, { document });
      once(document, 'pjax:ready', () => {
        assert(decodeURIComponent(window.location.pathname) === url);
        assert(decodeURIComponent(document.title) === 'Title あアｱ亜');
        assert(decodeURIComponent(document.querySelector('#primary').textContent!) === 'Primary あアｱ亜');
        done();
      });
      const a = document.createElement('a');
      a.href = url;
      document.body.appendChild(a);
      a.click();
    });

  });

});
