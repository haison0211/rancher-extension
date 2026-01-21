// Import our HelloWorld page
import HelloWorld from '../pages/HelloWorld.vue';

const BLANK_CLUSTER = '_';
const YOUR_PRODUCT_NAME = 'myFirstExtension';

const routes = [
  {
    name: `${ YOUR_PRODUCT_NAME }-c-cluster`,
    path: `/${ YOUR_PRODUCT_NAME }/c/:cluster`,
    component: HelloWorld,
    meta: {
      product: YOUR_PRODUCT_NAME,
      cluster: BLANK_CLUSTER,
      pkg: YOUR_PRODUCT_NAME,
    },
  },
];

export default routes;
