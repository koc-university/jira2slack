var request = require('supertest');
var accessToken = process.env.ACCESS_TOKEN || sails.config.jira2slack.accessToken;

describe('SlackController', function() {

	describe('#processWithoutToken()', function() {
		it('should return http 401', function(done) {
			request(sails.hooks.http.app)
				.post('/')
				.send({
					name: 'test',
					password: 'test'
				})
				.expect(401, done);
		});
	});

	describe('#emptyPostData()', function() {
		it('should return http 501', function(done) {
			request(sails.hooks.http.app)
				.post('/?token=' + accessToken)
				.send({})
				.expect(501, done);
		});
	});

	describe('#createChannel()', function() {
		it('should return http 200', function(done) {
			request(sails.hooks.http.app)
				.post('/?token=' + accessToken)
				.send({
					webhookEvent: 'project_created',
					project: {
						key: 'TEST_CHANNEL',
						name: 'MOCHA TEST CHANNEL'
					}
				})
				.expect(200, done);
		});
	});

	describe('#setChannelPurpos()', function() {
		it('should return http 200', function(done) {
			request(sails.hooks.http.app)
				.post('/?token=' + accessToken)
				.send({
					webhookEvent: 'project_updated',
					project: {
						key: 'TEST_CHANNEL',
						name: 'MOCHA TEST CHANNEL'
					}
				})
				.expect(200, done);
		});
	});

	describe('#archiveChannel()', function() {
		it('should return http 200', function(done) {
			request(sails.hooks.http.app)
				.post('/?token=' + accessToken)
				.send({
					webhookEvent: 'project_deleted',
					project: {
						key: 'TEST_CHANNEL',
						name: 'MOCHA TEST CHANNEL'
					}
				})
				.expect(200, done);
		});
	});

	describe('#issueCreatedPost()', function() {
		it('should return http 200', function(done) {
			request(sails.hooks.http.app)
				.post('/?token=' + accessToken)
				.send({
					webhookEvent: 'jira:issue_created',
					issue: {
						self: 'https://jira.example.com/jira/rest',
						key: 'TEST_ISSUE-01',
						fields: {
							project: {
								key: 'TEST_CHANNEL',
								name: 'MOCHA TEST CHANNEL'
							},
							summary: 'Mocha test issue',
							issuetype: {
								name: 'TASK'
							},
							priority: {
								name: 'MAJOR'
							},
							assignee: {
								name: 'carol'
							}
						}
					},
					user: {
						name: 'bob'
					}
				})
				.expect(200, done);
		});
	});

	describe('#commentCreatedPost()', function() {
		it('should return http 200', function(done) {
			request(sails.hooks.http.app)
				.post('/?token=' + accessToken)
				.send({
					webhookEvent: 'jira:issue_updated',
					issue: {
						self: 'https://jira.example.com/jira/rest',
						key: 'TEST_ISSUE-01',
						fields: {
							project: {
								key: 'TEST_CHANNEL',
								name: 'MOCHA TEST CHANNEL'
							},
							summary: 'Mocha test issue',
							issuetype: {
								name: 'TASK'
							},
							priority: {
								name: 'MAJOR'
							},
							assignee: {
								name: 'carol'
							}
						}
					},
					user: {
						name: 'bob'
					},
					comment: {
						body: 'This is a comment.'
					}
				})
				.expect(200, done);
		});
	});

	describe('#issueUpdatedPost()', function() {
		it('should return http 200', function(done) {
			request(sails.hooks.http.app)
				.post('/?token=' + accessToken)
				.send({
					webhookEvent: 'jira:issue_updated',
					issue: {
						self: 'https://jira.example.com/jira/rest',
						key: 'TEST_ISSUE-01',
						fields: {
							project: {
								key: 'TEST_CHANNEL',
								name: 'MOCHA TEST CHANNEL'
							},
							summary: 'Mocha test issue',
							issuetype: {
								name: 'TASK'
							}
						}
					},
					user: {
						name: 'bob'
					},
					changelog: {
						items: [{
							field: 'Priority',
							toString: 'MINOR'
						}, {
							field: 'SomeField',
							toString: 'SomeValue'
						}]
					}
				})
				.expect(200, done);
		});
	});

	describe('#issueDeletedPost()', function() {
		it('should return http 200', function(done) {
			request(sails.hooks.http.app)
				.post('/?token=' + accessToken)
				.send({
					webhookEvent: 'jira:issue_deleted',
					issue: {
						self: 'https://jira.example.com/jira/rest',
						key: 'TEST_ISSUE-01',
						fields: {
							project: {
								key: 'TEST_CHANNEL',
								name: 'MOCHA TEST CHANNEL'
							},
							summary: 'Mocha test issue',
						}
					},
					user: {
						name: 'bob'
					}
				})
				.expect(200, done);
		});
	});

});