if(!process.env.OPENSHIFT_APP_NAME)
    throw "Unsupported";

process.env.GIT_PATH = process.env.OPENSHIFT_TMP_DIR;
process.env.DATA_PATH = process.env.OPENSHIFT_DATA_DIR;
process.env.HOST_UUID = process.env.OPENSHIFT_GEAR_UUID;

process.env.HTTP_PORT = process.env.OPENSHIFT_NODEJS_PORT;
process.env.HTTP_HOST = process.env.OPENSHIFT_NODEJS_IP;

// Should probably try to detect if haproxy is in use or not... but for now assume it is...
process.env.HTTP_TRUST_PROXY = true;
process.env.NO_HEAVY_LIFTING = true;