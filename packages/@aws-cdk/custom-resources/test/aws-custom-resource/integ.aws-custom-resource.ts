#!/usr/bin/env node
import * as sns from '@aws-cdk/aws-sns';
import * as ssm from '@aws-cdk/aws-ssm';
import * as cdk from '@aws-cdk/core';
import { AwsCustomResource } from '../../lib';

const app = new cdk.App();

const stack = new cdk.Stack(app, 'aws-cdk-sdk-js');

const topic = new sns.Topic(stack, 'Topic');

const snsPublish = new AwsCustomResource(stack, 'Publish', {
  onUpdate: {
    service: 'SNS',
    action: 'publish',
    parameters: {
      Message: 'hello',
      TopicArn: topic.topicArn
    },
    physicalResourceId: topic.topicArn,
  }
});

const listTopics = new AwsCustomResource(stack, 'ListTopics', {
  onUpdate: {
    service: 'SNS',
    action: 'listTopics',
    physicalResourceIdPath: 'Topics.0.TopicArn'
  }
});
listTopics.node.addDependency(topic);

const ssmParameter = new ssm.StringParameter(stack, 'DummyParameter', {
  stringValue: '1337',
});
const getParameter = new AwsCustomResource(stack, 'GetParameter', {
  onUpdate: {
    service: 'SSM',
    action: 'getParameter',
    parameters: {
      Name: ssmParameter.parameterName,
      WithDecryption: true
    },
    physicalResourceIdPath: 'Parameter.ARN'
  }
});

new cdk.CfnOutput(stack, 'MessageId', { value: cdk.Token.asString(snsPublish.getData('MessageId')) });
new cdk.CfnOutput(stack, 'TopicArn', { value: cdk.Token.asString(listTopics.getData('Topics.0.TopicArn')) });
new cdk.CfnOutput(stack, 'ParameterValue', { value: cdk.Token.asString(getParameter.getData('Parameter.Value')) });

app.synth();
