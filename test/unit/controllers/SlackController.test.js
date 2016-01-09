var request = require('supertest');


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
				.post('/?token=' + sails.config.jira2slack.accessToken)
				.send({})
				.expect(501, done);
		});
	});

	describe('#createChannel()', function() {
		it('should return http 200', function(done) {
			request(sails.hooks.http.app)
				.post('/?token=' + sails.config.jira2slack.accessToken)
				.send({
					webhookEvent: 'project_created',
					project: {
						key: 'TEST_CHANNEL',
						name: 'MOCHA TEST CHANNEL',
						projectLead: {
							emailAddress: 'test@example.com'
						}
					}
				})
				.expect(200, done);
		});

		it('mising channel, should return http 500', function(done) {
			request(sails.hooks.http.app)
				.post('/?token=' + sails.config.jira2slack.accessToken)
				.send({
					webhookEvent: 'project_created',
					project: {
						key: '',
						name: 'MOCHA TEST CHANNEL',
						projectLead: {
							emailAddress: 'test@example.com'
						}
					}
				})
				.expect(500, done);
		});
	});

	describe('#setChannelPurpose()', function() {
		it('should return http 200', function(done) {
			request(sails.hooks.http.app)
				.post('/?token=' + sails.config.jira2slack.accessToken)
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
				.post('/?token=' + sails.config.jira2slack.accessToken)
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
				.post('/?token=' + sails.config.jira2slack.accessToken)
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
								name: 'carol',
								displayName: 'Carol Smith',
								emailAddress: 'test@example.com'
							}
						}
					},
					user: {
						name: 'bob',
						displayName: 'Bob Smith',
						emailAddress: 'test@example.com'
					}
				})
				.expect(200, done);
		});
	});

	describe('#commentCreatedPost()', function() {
		it('should return http 200', function(done) {
			request(sails.hooks.http.app)
				.post('/?token=' + sails.config.jira2slack.accessToken)
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
								name: 'carol',
								displayName: 'Carol Smith',
								emailAddress: 'test@example.com'
							}
						}
					},
					user: {
						name: 'bob',
						displayName: 'Bob Smith', 
						emailAddress: 'test@example.com'
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
				.post('/?token=' + sails.config.jira2slack.accessToken)
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
						name: 'bob',
						displayName: 'Bob Smith',
						emailAddress: 'test@example.com'
					},
					changelog: {
						items: [{
							field: 'Priority',
							fromString: 'MINOR',
							toString: 'MAJOR'
						}, {
							field: 'SomeField',
							fromString: 'SomeValue',
							toString: 'SomeOtherValue'
						}]
					}
				})
				.expect(200, done);
		});
	});

	describe('#issueDeletedPost()', function() {
		it('should return http 200', function(done) {
			request(sails.hooks.http.app)
				.post('/?token=' + sails.config.jira2slack.accessToken)
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
						name: 'bob',
						displayName: 'Bob Smith',
						emailAddress: 'test@example.com'
					}
				})
				.expect(200, done);
		});
	});

	describe('#issueClosedPost()', function() {
		it('should return http 200', function(done) {
			request(sails.hooks.http.app)
				.post('/?token=' + sails.config.jira2slack.accessToken)
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
							resolution: {
								self: 'http://jira.example.com/jira/rest/api/2/resolution/10001',
								id: '10001',
								description: 'This was completed.',
								name: 'Done'
							},
							creator: {
								name: 'admin',
								key: 'admin',
								emailAddress: 'admin@admin.com',
								displayName: 'Bob Smith',
							},
						}
					},
					user: {
						name: 'bob',
						displayName: 'Bob Smith',
						emailAddress: 'test@example.com'
					},
					changelog: {
						items: [{
							field: 'resolution',
							fieldtype: 'jira',
							from: null,
							fromString: null,
							to: '10001',
							toString: 'Done'
						}, {
							field: 'SomeField',
							fromString: 'SomeValue',
							toString: 'SomeOtherValue'
						}]
					}
				})
				.expect(200, done);
		});
	});

	describe('#workLogUpdated()', function() {
		it('should return http 200', function(done) {
			request(sails.hooks.http.app)
				.post('/?token=' + sails.config.jira2slack.accessToken)
				.send({
					webhookEvent: 'jira:worklog_updated',
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
						name: 'bob',
						displayName: 'Bob Smith',
						emailAddress: 'test@example.com'
					},
					changelog: {
						items: [{
							field: 'timeestimate',
							toString: '144000'
						}, {
							field: 'timespent',
							fromString: '28800',
							toString: '57600'
						}]
					}
				})
				.expect(200, done);
		});
	});

});