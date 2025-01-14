import * as cloudwatch from '@aws-cdk/aws-cloudwatch';
import { Construct, Fn } from '@aws-cdk/core';
import { Function } from './function';
import { IFunction, QualifiedFunctionBase } from './function-base';
import { CfnVersion } from './lambda.generated';

export interface IVersion extends IFunction {
  /**
   * The most recently deployed version of this function.
   * @attribute
   */
  readonly version: string;

  /**
   * The underlying AWS Lambda function.
   */
  readonly lambda: IFunction;
}

/**
 * Properties for a new Lambda version
 */
export interface VersionProps {
  /**
   * SHA256 of the version of the Lambda source code
   *
   * Specify to validate that you're deploying the right version.
   *
   * @default No validation is performed
   */
  readonly codeSha256?: string;

  /**
   * Description of the version
   *
   * @default Description of the Lambda
   */
  readonly description?: string;

  /**
   * Function to get the value of
   */
  readonly lambda: IFunction;

  /**
   * Specifies a provisioned concurrency configuration for a function's version.
   *
   * @default No provisioned concurrency
   */
  readonly provisionedConcurrentExecutions?: number;
}

export interface VersionAttributes {
  /**
   * The version.
   */
  readonly version: string;

  /**
   * The lambda function.
   */
  readonly lambda: IFunction;
}

/**
 * A single newly-deployed version of a Lambda function.
 *
 * This object exists to--at deploy time--query the "then-current" version of
 * the Lambda function that it refers to. This Version object can then be
 * used in `Alias` to refer to a particular deployment of a Lambda.
 *
 * This means that for every new update you deploy to your Lambda (using the
 * CDK and Aliases), you must always create a new Version object. In
 * particular, it must have a different name, so that a new resource is
 * created.
 *
 * If you want to ensure that you're associating the right version with
 * the right deployment, specify the `codeSha256` property while
 * creating the `Version.
 */
export class Version extends QualifiedFunctionBase implements IVersion {

  /**
   * Construct a Version object from a Version ARN.
   *
   * @param scope The cdk scope creating this resource
   * @param id The cdk id of this resource
   * @param versionArn The version ARN to create this version from
   */
  public static fromVersionArn(scope: Construct, id: string, versionArn: string): IVersion {
    const version = extractVersionFromArn(versionArn);
    const lambda = Function.fromFunctionArn(scope, `${id}Function`, versionArn);

    class Import extends QualifiedFunctionBase implements IVersion {
      public readonly version = version;
      public readonly lambda = lambda;
      public readonly functionName = `${lambda.functionName}:${version}`;
      public readonly functionArn = versionArn;
      public readonly grantPrincipal = lambda.grantPrincipal;
      public readonly role = lambda.role;

      protected readonly canCreatePermissions = false;
    }
    return new Import(scope, id);
  }

  public static fromVersionAttributes(scope: Construct, id: string, attrs: VersionAttributes): IVersion {
    class Import extends QualifiedFunctionBase implements IVersion {
      public readonly version = attrs.version;
      public readonly lambda = attrs.lambda;
      public readonly functionName = `${attrs.lambda.functionName}:${attrs.version}`;
      public readonly functionArn = `${attrs.lambda.functionArn}:${attrs.version}`;
      public readonly grantPrincipal = attrs.lambda.grantPrincipal;
      public readonly role = attrs.lambda.role;

      protected readonly canCreatePermissions = false;
    }
    return new Import(scope, id);
  }

  public readonly version: string;
  public readonly lambda: IFunction;
  public readonly functionArn: string;
  public readonly functionName: string;

  protected readonly canCreatePermissions = true;

  constructor(scope: Construct, id: string, props: VersionProps) {
    super(scope, id);

    this.lambda = props.lambda;

    const version = new CfnVersion(this, 'Resource', {
      codeSha256: props.codeSha256,
      description: props.description,
      functionName: props.lambda.functionName,
      provisionedConcurrencyConfig: this.determineProvisionedConcurrency(props)
    });

    this.version = version.attrVersion;
    this.functionArn = version.ref;
    this.functionName = `${this.lambda.functionName}:${this.version}`;
  }

  public get grantPrincipal() {
    return this.lambda.grantPrincipal;
  }

  public get role() {
    return this.lambda.role;
  }

  public metric(metricName: string, props: cloudwatch.MetricOptions = {}): cloudwatch.Metric {
    // Metrics on Aliases need the "bare" function name, and the alias' ARN, this differes from the base behavior.
    return super.metric(metricName, {
      dimensions: {
        FunctionName: this.lambda.functionName,
        // construct the ARN from the underlying lambda so that alarms on an alias
        // don't cause a circular dependency with CodeDeploy
        // see: https://github.com/aws/aws-cdk/issues/2231
        Resource: `${this.lambda.functionArn}:${this.version}`
      },
      ...props
    });
  }

  /**
   * Validate that the provisionedConcurrentExecutions makes sense
   *
   * Member must have value greater than or equal to 1
   */
  private determineProvisionedConcurrency(props: VersionProps): CfnVersion.ProvisionedConcurrencyConfigurationProperty | undefined {
    if (!props.provisionedConcurrentExecutions) {
      return undefined;
    }

    if (props.provisionedConcurrentExecutions <= 0) {
      throw new Error('provisionedConcurrentExecutions must have value greater than or equal to 1');
    }

    return {provisionedConcurrentExecutions: props.provisionedConcurrentExecutions};
  }
}

/**
 * Given an opaque (token) ARN, returns a CloudFormation expression that extracts the version
 * name from the ARN.
 *
 * Version ARNs look like this:
 *
 *   arn:aws:lambda:region:account-id:function:function-name:version
 *
 * ..which means that in order to extract the `version` component from the ARN, we can
 * split the ARN using ":" and select the component in index 7.
 *
 * @returns `FnSelect(7, FnSplit(':', arn))`
 */
function extractVersionFromArn(arn: string) {
  return Fn.select(7, Fn.split(':', arn));
}
