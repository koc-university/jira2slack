var request = require('supertest');

describe('SlackController', function() {

  describe('#processWithoutToken()', function() {
    it('should return  http 401', function (done) {
      request(sails.hooks.http.app)
        .post('/')
        .send({ name: 'test', password: 'test' })
        .expect(401,done);
    });
  });

});